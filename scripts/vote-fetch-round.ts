// Fetch the BFV pk + token-holder Merkle leaves from a CRISP server and write a
// round-data JSON that vote-real can consume.
//
// Usage: bun scripts/vote-fetch-round.ts [market] [enclave-api] [out=/tmp/round.json] [balance=1]
import { $ } from "bun";
import { marketFromArgOrEnv, marketArgConsumed, usage } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run fetch-round [market] [enclave-api] [out] [balance]");
const offset = marketArgConsumed(process.argv[2]) ? 3 : 2;
const api = process.argv[offset] ?? process.env.ENCLAVE_API;
const out = process.argv[offset + 1] ?? `/tmp/crisp-round-${market.slice(2, 10)}.json`;
const balance = process.argv[offset + 2] ?? "1";

if (!api) usage("scripts/vote-fetch-round.ts", "[market] <enclave-api> [out] [balance] (or set ENCLAVE_API in .env)");

await $`bun voter-cli/src/cli.ts fetch-round --market ${market} --enclave-api ${api} --out ${out} --balance ${balance}`;
