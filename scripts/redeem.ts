// Redeem the caller's winning shares on a finalised market.
// Usage: bun scripts/redeem.ts <market-address>
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run redeem [market]");

log(`redeeming on ${market}`);
await $`cast send ${market} "redeemAll()" --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ redeemed");
