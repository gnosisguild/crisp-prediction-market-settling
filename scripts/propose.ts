// Stage 1 — optimistically propose an outcome on a market once trading has closed.
// Permissionless and bond-free on-chain (the proposer bond is narrated in the UI).
//
// Usage: bun scripts/propose.ts [market] <yes|no|1|2>
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run propose [market] <yes|no>");

// Outcome token is the first arg that isn't the market address.
const raw = process.argv.slice(2).find((a) => a && !a.startsWith("0x"))?.toLowerCase();
const outcome = raw === "yes" || raw === "1" ? 1 : raw === "no" || raw === "2" ? 2 : 0;
if (outcome === 0) {
  console.error("usage: bun run propose [market] <yes|no>");
  process.exit(1);
}

log(`proposing ${outcome === 1 ? "YES" : "NO"} on market ${market}`);
await $`cast send ${market} "proposeOutcome(uint256)" ${outcome} \
  --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ proposeOutcome submitted");
