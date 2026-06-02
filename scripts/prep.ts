// Operator prep: bring an E3 to the point where a voter can cast a ballot.
//
//   1. open the CRISP vote if not already open (anyone can call)
//   2. wait for the committee DKG → KeyPublished (or higher)
//   3. fetch pk + token-holder leaves from the CRISP server, write round-data JSON
//
// The CRISP server's indexer is responsible for snapshotting the census (holders of
// the configured CENSUS_TOKEN), hashing them, and calling CRISPProgram.setMerkleRoot
// itself. So we don't compute the census or set the root — we just consume what the
// server publishes.
//
// Idempotent: each step checks if it's already been done before acting.
// Reads everything from .env (see .env.example).

import {
  ENV,
  requireMarket,
  requireApi,
  voterAddress,
  step,
  ok,
  info,
  c,
} from "./_env";
import { voterCli, run } from "./_proc";

const E3_KEY_PUBLISHED = 3;

const MARKET = requireMarket();
const VOTER = voterAddress();
const API = requireApi();

const ROUND_JSON = `/tmp/crisp-round-${MARKET.slice(2, 10)}.json`;

// ---------- step 0: walk the escalation ladder ----------
// openVote now only works once a dispute has escalated to the attester layer. Walk
// propose → dispute → token vote → escalate first (idempotent — skips done stages).
step("ladder", "ensuring the dispute has escalated to the attester layer");
await run("bun", ["scripts/ladder.ts", MARKET]);

// ---------- step 1: open vote ----------
step("prep", "checking if CRISP vote is open");
let e3OutLine = (await voterCli.capture(["e3-for", "--market", MARKET]))
  .split("\n").find((l) => l.includes("e3Id:")) ?? "";
let e3Id = (e3OutLine.match(/e3Id:\s*(\d+)/) ?? [])[1];
if (!e3Id) {
  info("no E3 yet — opening one (calls adapter.openVote)");
  await voterCli.exec(["open", "--market", MARKET]);
  e3OutLine = (await voterCli.capture(["e3-for", "--market", MARKET]))
    .split("\n").find((l) => l.includes("e3Id:")) ?? "";
  e3Id = (e3OutLine.match(/e3Id:\s*(\d+)/) ?? [])[1];
  if (!e3Id) throw new Error("failed to read e3Id after openVote");
}
ok(`e3Id = ${c.bold(e3Id)}`);
info(`voter address: ${VOTER}  (must hold 1 CENSUS_TOKEN to be eligible)`);

// Sanity check: VOTER_KEY must be one of the wallets in VOTERS. Fast-fail with a
// clear message rather than waiting until cast tries to generate the proof.
const oracleList = (process.env.VOTERS ?? "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter((a) => a.startsWith("0x"));
if (oracleList.length > 0 && !oracleList.includes(VOTER.toLowerCase())) {
  console.error(
    `\n  ✗ VOTER_KEY's address (${VOTER}) is not in the VOTERS list.` +
      `\n    Set VOTER_KEY to one of:\n      ${oracleList.join("\n      ")}` +
      `\n    (these are the wallets funded with DVT and snapshotted by the CRISP server)\n`,
  );
  process.exit(1);
}

// ---------- step 2: wait for committee DKG + server-side census/setMerkleRoot ----------
step("dkg", "waiting for committee to publish the BFV public key");
{
  const MAX_WAIT_MS = 15 * 60 * 1000;
  const POLL_MS = 60_000;
  const startedAt = Date.now();
  let lastStage = -1;
  while (true) {
    const out = await voterCli.capture(["status", "--market", MARKET]);
    const m = out.match(/stage=(\d+)/);
    const stage = m ? Number(m[1]) : 0;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (stage !== lastStage) {
      process.stdout.write(`\n  stage=${stage}/${E3_KEY_PUBLISHED}  (+${elapsed}s)`);
      lastStage = stage;
    } else {
      process.stdout.write(`\r  stage=${stage}/${E3_KEY_PUBLISHED}  (+${elapsed}s)            `);
    }
    if (stage >= E3_KEY_PUBLISHED) {
      process.stdout.write("\n");
      ok("committee key published");
      break;
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.log();
      throw new Error(`timed out after ${MAX_WAIT_MS / 60_000}min — check your ciphernodes`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// ---------- step 3: fetch pk + leaves from the CRISP server ----------
// The CRISP server snapshots holders of the configured CENSUS_TOKEN and posts the
// hashed leaves to /state/token-holders. It also calls setMerkleRoot on chain from
// its own indexer wallet (which is the CRISPProgram owner). We just consume both.
step("round-data", "fetching pk + census leaves from CRISP server");
await voterCli.exec([
  "fetch-round",
  "--market", MARKET,
  "--enclave-api", API,
  "--balance", "1",        // each oracle holds 1 CENSUS_TOKEN
  "--out", ROUND_JSON,
]);

console.log(`\n${c.green("✓")} prep complete. Next:`);
console.log(`    ${c.bold("bun run cast")} ${c.dim(`[YES|NO]  (defaults to ${ENV.SIDE})`)}`);
console.log(`    ${c.dim(`round-data file: ${ROUND_JSON}`)}\n`);
