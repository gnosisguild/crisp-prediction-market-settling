// Walk the optimistic escalation ladder to the point where the attester (CRISP) vote can open:
//   propose → dispute → record public token vote → escalate to attesters.
//
// Idempotent: each step checks on-chain state and only fires the transitions still needed, so
// it's safe to run before openVote in the headless flow (prep.ts / fresh.ts) or standalone.
//
// Usage: bun scripts/ladder.ts [market]
//   LADDER_OUTCOME=yes|no   optimistic proposal side (default yes)
//   LADDER_TV_YES / _NO     mock public token-vote weights (default 30 / 70)
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run ladder [market]");

async function callOne(sig: string): Promise<string> {
  const r = await $`cast call ${market} ${sig} --rpc-url ${RPC}`.quiet();
  return r.stdout.toString().trim().split(/\s+/)[0];
}
async function send(sig: string, ...args: string[]) {
  await $`cast send ${market} ${sig} ${args} --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
}

const status = Number(await callOne("getCurrentStatus()(uint8)"));
if (status === 0) {
  console.error("✗ trading is still open — wait for the trading window to close before the ladder");
  process.exit(1);
}

const proposed = BigInt(await callOne("proposedOutcome()(uint256)"));
const disputed = (await callOne("disputed()(bool)")) === "true";
const tokenVoted = (await callOne("tokenVoteRecorded()(bool)")) === "true";
const escalated = (await callOne("escalated()(bool)")) === "true";

if (escalated) {
  log("already escalated to attesters — nothing to do");
  process.exit(0);
}

if (proposed === 0n) {
  const side = (process.env.LADDER_OUTCOME ?? "yes").toLowerCase() === "no" ? 2 : 1;
  log(`stage 1 · proposeOutcome(${side === 1 ? "YES" : "NO"})`);
  await send("proposeOutcome(uint256)", String(side));
}
if (!disputed) {
  log("stage 2 · dispute()");
  await send("dispute()");
}
if (!tokenVoted) {
  const tvYes = process.env.LADDER_TV_YES ?? "30";
  const tvNo = process.env.LADDER_TV_NO ?? "70";
  log(`stage 3 · recordTokenVote(${tvYes}, ${tvNo}) — public, plutocratic`);
  await send("recordTokenVote(uint256,uint256)", tvYes, tvNo);
}
log("stage 4 · escalateToAttesters()");
await send("escalateToAttesters()");
log("✓ escalated — adapter.openVote is now allowed");
