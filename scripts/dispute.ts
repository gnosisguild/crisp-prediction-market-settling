// Stage 2 — dispute the optimistic proposal, kicking resolution into the public token vote.
// Permissionless and bond-free on-chain (the dispute bond is narrated in the UI).
//
// Usage: bun scripts/dispute.ts [market]
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run dispute [market]");

log(`disputing proposal on market ${market}`);
await $`cast send ${market} "dispute()" --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ dispute submitted");
