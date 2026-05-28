// Fetch the BFV committee public key for a market's E3 from a running CRISP server.
// Usage: bun scripts/vote-fetch-pk.ts <market-address> <enclave-api-url> [out-file]
//
// If [out-file] is omitted, prints the 0x-hex pk to stdout (pipeable into a shell var).
import { $ } from "bun";
import { marketFromArgOrEnv, marketArgConsumed, usage } from "./_common";

const market = marketFromArgOrEnv(process.argv[2], "run fetch-pk [market] <enclave-api> [out]");
const offset = marketArgConsumed(process.argv[2]) ? 3 : 2;
// also accept ENCLAVE_API from env (.env) so it's optional on CLI too
const api = process.argv[offset] ?? process.env.ENCLAVE_API;
const out = process.argv[offset + 1];
if (!api) usage("scripts/vote-fetch-pk.ts", "[market] <enclave-api> [out] (or set ENCLAVE_API in .env)");

const args = ["voter-cli/src/cli.ts", "fetch-pk", "--market", market, "--enclave-api", api];
if (out) args.push("--out", out);
await $`bun ${args}`;
