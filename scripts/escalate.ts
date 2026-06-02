// Stage 4 — escalate the dispute to the sealed attester layer. This is what un-gates
// adapter.openVote: the CRISP committee is only allocated once we reach here.
//
// Usage: bun scripts/escalate.ts [market]
import { $ } from "bun";
import { RPC, PRIVATE_KEY, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run escalate [market]");

log(`escalating to attesters on market ${market}`);
await $`cast send ${market} "escalateToAttesters()" --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ escalateToAttesters submitted — adapter.openVote is now allowed");
