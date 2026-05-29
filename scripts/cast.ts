// Voter step: sign + BFV-encrypt + Noir-prove + submit publishInput.
// Reads MARKET, VOTER_KEY, ENCLAVE_API, SIDE from .env (or CLI: bun run cast YES|NO).
//
// Assumes `bun run prep` has already been run for this market.
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import {
  ENV,
  requireMarket,
  requireAdapter,
  requireVoterKey,
  requireApi,
  step,
  ok,
  info,
  c,
} from "./_env";
import { voterCli } from "./_proc";

const MARKET = requireMarket();
const ADAPTER = requireAdapter();
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

// Bail out if round.json was fetched for a different e3Id than the chain currently
// has — its cached pk/leaves would be stale and the proof would silently fail.
const cachedRound = JSON.parse(readFileSync(ROUND_JSON, "utf-8")) as { e3Id?: string };
if (!cachedRound.e3Id) {
  console.error(`\n  ✗ ${ROUND_JSON} missing e3Id field — re-run \`bun run prep\`.\n`);
  process.exit(1);
}
const adapterAbi = [{
  type: "function",
  stateMutability: "view",
  name: "e3IdOf",
  inputs: [{ name: "m", type: "address" }],
  outputs: [{ type: "uint256" }],
}] as const;
const client = createPublicClient({ transport: http(ENV.RPC) });
const onChainE3Id = (await client.readContract({
  address: ADAPTER,
  abi: adapterAbi,
  functionName: "e3IdOf",
  args: [MARKET],
})) as bigint;
const cachedE3Id = BigInt(cachedRound.e3Id);
if (onChainE3Id !== cachedE3Id) {
  console.error(
    `\n  ✗ e3Id mismatch: round.json=${cachedE3Id} but chain=${onChainE3Id}. Re-run \`bun run prep\`.\n`,
  );
  process.exit(1);
}
info(`e3Id ${onChainE3Id} matches cached round-data`);

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
