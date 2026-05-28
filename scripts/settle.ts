// Call adapter.proposeFromCRISP(market). Reads decrypted CRISP tally + posts the
// resolver bond + transitions the market to ResolutionProposed.
//
// Usage: bun scripts/settle.ts <market-address>
import { $ } from "bun";
import { RPC, PRIVATE_KEY, ADAPTER, marketFromArgOrEnv, log } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run settle [market]");

log(`settling market ${market} via adapter ${ADAPTER}`);
await $`cast send ${ADAPTER} "proposeFromCRISP(address)" ${market} \
  --private-key ${PRIVATE_KEY} --rpc-url ${RPC}`;
log("✓ proposeFromCRISP submitted");

const statusR = await $`cast call ${market} "getCurrentStatus()(uint8)" --rpc-url ${RPC}`.quiet();
const wpR = await $`cast call ${market} "winningPosition()(uint256)" --rpc-url ${RPC}`.quiet();
const status = Number(statusR.stdout.toString().trim().split(/\s+/)[0]);
const wp = Number(wpR.stdout.toString().trim().split(/\s+/)[0]);
const wpLabel = wp === 1 ? "YES" : wp === 2 ? "NO" : wp === 3 ? "CANCELED" : "—";
log(`status=${status} (2=ResolutionProposed, 7=Finalized)  winningPosition=${wp} (${wpLabel})`);
