// Voter step: sign + BFV-encrypt + Noir-prove + submit publishInput.
// Reads MARKET, VOTER_KEY, ENCLAVE_API, SIDE from .env (or CLI: bun run cast YES|NO).
//
// Assumes `bun run prep` has already been run for this market.
import { existsSync } from "node:fs";
import {
  ENV,
  requireMarket,
  requireVoterKey,
  requireApi,
  step,
  ok,
  info,
  c,
} from "./_env";
import { voterCli } from "./_proc";

const MARKET = requireMarket();
const VOTER_KEY = requireVoterKey();
const API = requireApi();

const argSide = (process.argv[2] ?? ENV.SIDE).toUpperCase();
if (argSide !== "YES" && argSide !== "NO") {
  console.error(`side must be YES or NO, got '${argSide}'`);
  process.exit(1);
}
const SIDE = argSide as "YES" | "NO";
const WEIGHT = process.argv[3] ?? ENV.WEIGHT;

const ROUND_JSON = `/tmp/crisp-round-${MARKET.slice(2, 10)}.json`;
if (!existsSync(ROUND_JSON)) {
  console.error(`\n  ✗ ${ROUND_JSON} doesn't exist — run \`bun run prep\` first\n`);
  process.exit(1);
}

step("cast", `${SIDE} weight=${WEIGHT} on ${MARKET}`);
info(`round-data: ${ROUND_JSON}`);
info(`generating BFV ciphertext + Noir proof (~30-110s first run, faster after)`);

await voterCli.exec(
  [
    "vote-real",
    "--market", MARKET,
    "--side", SIDE,
    "--weight", WEIGHT,
    "--round-data", ROUND_JSON,
    "--enclave-api", API,
  ],
  { VOTER_KEY, VOTER_PRIVATE_KEY: VOTER_KEY },
);

console.log(`\n${c.green("✓")} ballot submitted. Next:`);
console.log(`    ${c.bold("bun run resolve")} ${c.dim("(waits for committee decrypt, settles trueo, redeems)")}\n`);
