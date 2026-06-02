// Stage 3 — record a PUBLIC (mock) token-holder tally. Stand-in for the financialized layer:
// transparent by design, the opposite of the sealed attester vote.
//
// Usage: bun scripts/token-vote.ts [market] <yesWeight> <noWeight>
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run token-vote [market] <yes> <no>");

// The two numeric args (in order) that aren't the market address.
const nums = process.argv.slice(2).filter((a) => a && !a.startsWith("0x") && /^\d+$/.test(a));
const yes = nums[0] ?? "30";
const no = nums[1] ?? "70";

log(`recording public token vote on ${market}: ${yes} yes · ${no} no`);
await $`cast send ${market} "recordTokenVote(uint256,uint256)" ${yes} ${no} \
  --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ recordTokenVote submitted");
