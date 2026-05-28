// Show the current CRISP committee stage + (if decrypted) tally for a market.
// Usage: bun scripts/vote-status.ts <market-address>
import { $ } from "bun";
import { marketFromArgOrEnv } from "./_common";
const market = marketFromArgOrEnv(process.argv[2], "run status [market]");
await $`bun voter-cli/src/cli.ts status --market ${market}`;
