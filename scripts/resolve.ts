// Anyone step: wait for the committee threshold-decryption, settle the trueo
// market via the adapter, wait for the challenge period, then redeem.
//
// Reads MARKET, ADAPTER, DEPLOYER_KEY (or PRIVATE_KEY), VOTER_KEY from .env.

import {
  ENV,
  requireMarket,
  requireAdapter,
  requireDeployerKey,
  requireVoterKey,
  step,
  ok,
  info,
  c,
} from "./_env";
import { voterCli, cast } from "./_proc";

const E3_COMPLETE = 5;

const MARKET = requireMarket();
const ADAPTER = requireAdapter();
const DEPLOYER_KEY = requireDeployerKey();
const VOTER_KEY = requireVoterKey();
const RPC = ENV.RPC;

// ---------- step 1: wait for committee decryption ----------
// The CRISP input window is 30 min by default (see DeploySepolia.INPUT_WINDOW).
// The committee can only decrypt AFTER it closes, so total wait is up to
// (remaining input window) + (decryption ~1-5 min). 60 min ceiling covers the worst case.
const MAX_WAIT_MS = 60 * 60 * 1000;
const POLL_MS = 15_000;
step("decrypt", `waiting for committee to threshold-decrypt (poll every ${POLL_MS / 1000}s, up to ${MAX_WAIT_MS / 60_000}min)`);
const startedAt = Date.now();
let lastStage = -1;
while (true) {
  const out = await voterCli.capture(["status", "--market", MARKET]);
  const m = out.match(/stage=(\d+)/);
  const stage = m ? Number(m[1]) : 0;
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  if (stage !== lastStage) {
    process.stdout.write(`\n  stage=${stage}/${E3_COMPLETE}  (+${elapsed}s)`);
    lastStage = stage;
  } else {
    process.stdout.write(`\r  stage=${stage}/${E3_COMPLETE}  (+${elapsed}s)            `);
  }
  if (stage >= E3_COMPLETE) {
    process.stdout.write("\n");
    ok("decrypted");
    break;
  }
  if (Date.now() - startedAt > MAX_WAIT_MS) {
    console.log();
    throw new Error(`timed out waiting for Complete after ${MAX_WAIT_MS / 60_000}min — re-run 'bun run resolve' later`);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

// Print the tally for visibility
const tally = await voterCli.capture(["tally", "--market", MARKET]);
const tLine = tally.split("\n").find((l) => l.includes("YES=")) ?? tally.trim();
info(`tally: ${tLine}`);

// ---------- step 2: settle via the adapter ----------
step("settle", `adapter.proposeFromCRISP(${MARKET})`);
await cast.send(
  [ADAPTER, "proposeFromCRISP(address)", MARKET, "--rpc-url", RPC, "--private-key", DEPLOYER_KEY],
);
ok("proposeFromCRISP submitted");

const statusR = await cast.call([MARKET, "getCurrentStatus()(uint8)", "--rpc-url", RPC]);
const wpR = await cast.call([MARKET, "winningPosition()(uint256)", "--rpc-url", RPC]);
const status = Number(statusR.split(/\s+/)[0]);
const wp = Number(wpR.split(/\s+/)[0]);
const wpLabel = wp === 1 ? "YES" : wp === 2 ? "NO" : wp === 3 ? "CANCELED" : "—";
info(`status=${status} (2=ResolutionProposed, 7=Finalized)  winning=${wp} (${wpLabel})`);

// ---------- step 3: wait for challenge period ----------
step("challenge", "waiting for the trueo challenge period to elapse");
const proposedAt = BigInt(
  (await cast.call([MARKET, "resolutionProposedAt()(uint256)", "--rpc-url", RPC])).split(/\s+/)[0],
);
const challenge = BigInt(
  (await cast.call([MARKET, "firstChallengePeriod()(uint256)", "--rpc-url", RPC])).split(/\s+/)[0],
);
const finaliseAt = proposedAt + challenge;
const totalWait = Number(challenge) + 5;
info(`will finalise at unix ${finaliseAt} (~${Math.round(totalWait / 60)} min)`);

for (let i = 0; i < totalWait; i++) {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Number(finaliseAt) - now;
  process.stdout.write(`\r  ${Math.max(0, remaining)}s until finalised            `);
  if (remaining <= 0) break;
  await new Promise((r) => setTimeout(r, 5000));
}
process.stdout.write("\n");

const finalStatus = Number(
  (await cast.call([MARKET, "getCurrentStatus()(uint8)", "--rpc-url", RPC])).split(/\s+/)[0],
);
info(`final status=${finalStatus} (expect 7 = Finalized)`);
if (finalStatus !== 7) {
  console.log(c.amber("  ⚠ not yet finalised — may need to wait a bit longer"));
}

// ---------- step 4: redeem ----------
step("redeem", "claim winning shares");
try {
  await cast.send([MARKET, "redeemAll()", "--rpc-url", RPC, "--private-key", VOTER_KEY]);
  ok("redeemed");
} catch (e) {
  console.log(c.amber(`  ⚠ redeem failed (you may not hold any of the winning side): ${e instanceof Error ? e.message.split("\n")[0] : e}`));
}

console.log(`\n${c.green("✓")} resolve complete.\n`);
