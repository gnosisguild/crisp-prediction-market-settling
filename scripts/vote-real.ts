// REAL CRISP vote: BFV-encrypted ballot + Noir proof via @crisp-e3/sdk.
//
// Usage: bun scripts/vote-real.ts <market-address> <YES|NO> <weight> <round-data-path>
import { $ } from "bun";
import { marketFromArgOrEnv, marketArgConsumed, usage } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run vote [market] YES|NO <weight> <round-data>");
const offset = marketArgConsumed(process.argv[2]) ? 3 : 2;
const side = process.argv[offset];
const weight = process.argv[offset + 1];
const round = process.argv[offset + 2];
if (side !== "YES" && side !== "NO") usage("scripts/vote-real.ts", "[market] YES|NO <weight> <round-data>");
if (!weight || !round) usage("scripts/vote-real.ts", "[market] YES|NO <weight> <round-data>");

await $`bun voter-cli/src/cli.ts vote-real --market ${market} --side ${side} --weight ${weight} --round-data ${round}`;
