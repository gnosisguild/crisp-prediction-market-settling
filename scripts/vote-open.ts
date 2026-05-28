// Open a CRISP vote for a market (allocates a fresh e3Id atomically).
// Usage: bun scripts/vote-open.ts <market-address>
import { $ } from "bun";
import { marketFromArgOrEnv } from "./_common";
const market = marketFromArgOrEnv(process.argv[2], "run open [market]");
await $`bun voter-cli/src/cli.ts open --market ${market}`;
