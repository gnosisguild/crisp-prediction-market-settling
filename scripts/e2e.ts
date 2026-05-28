// Full real-CRISP voting flow in one command:
//   prep → cast → resolve
//
// Usage:  bun run e2e [YES|NO]
//
// Reads everything from .env. Assumes:
//   - `bun run sepolia` has been run and .env has USDC/BONDS/MANAGER/ADAPTER
//   - a market has been created via the UI and its address pasted into .env as MARKET
//   - the deployer wallet has Sepolia ETH + the adapter has Sepolia USDC for fees
//   - your CRISP server (ENCLAVE_API) is running and reachable
import { run } from "./_proc";

const side = process.argv[2] ?? "YES";
console.log(`\n\x1b[1m▶ end-to-end CRISP-resolved market lifecycle (side=${side})\x1b[0m\n`);

await run("bun", ["scripts/prep.ts"]);
await run("bun", ["scripts/cast.ts", side]);
await run("bun", ["scripts/resolve.ts"]);

console.log("\n\x1b[1;32m▶ e2e complete\x1b[0m\n");
