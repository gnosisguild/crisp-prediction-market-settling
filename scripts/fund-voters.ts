// Mint 1 CENSUS_TOKEN to each oracle in the VOTERS list, so the CRISP server's
// indexer picks them up in the next E3's census snapshot.
//
// CENSUS_TOKEN is the ERC20 the CRISP server uses for census membership. Default
// in .env is DVT on Sepolia (0x0B27...Cf9b), which exposes a public mint().
//
// Reads from .env:
//   VOTERS        comma-separated oracle addresses
//   CENSUS_TOKEN   token to mint
//   DEPLOYER_KEY   any wallet with enough Sepolia ETH for the mint txs
//   RPC            Sepolia RPC URL
//
// Usage: bun run fund-voters
import { spawn } from "node:child_process";
import { requireDeployerKey, requireRpc, log } from "./_common";

const RPC = requireRpc("run fund-voters");
const PK = requireDeployerKey("run fund-voters");

const CENSUS_TOKEN = process.env.CENSUS_TOKEN ?? "0x0B27C944c2E0EEC1A7A0ABdf2F62b2ea9198Cf9b";
const VOTERS = (process.env.VOTERS ?? "")
  .split(",")
  .map((a) => a.trim())
  .filter((a) => a.startsWith("0x"));

if (VOTERS.length === 0) {
  console.error("✗ set VOTERS=0xaddr1,0xaddr2,... in .env");
  process.exit(1);
}

// DVT has 18 decimals (standard ERC20); mint 1 whole token to each.
const ONE = 10n ** 18n;

async function castSend(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "cast",
      ["send", CENSUS_TOKEN, ...args, "--rpc-url", RPC, "--private-key", PK],
      { stdio: "inherit", env: process.env },
    );
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cast send exit ${code}`))));
  });
}

log(`funding ${VOTERS.length} oracle wallet${VOTERS.length === 1 ? "" : "s"} with 1 ${CENSUS_TOKEN.slice(0, 8)}…`);
for (const oracle of VOTERS) {
  log(`  → ${oracle}`);
  await castSend(["mint(address,uint256)", oracle, ONE.toString()]);
}
log("✓ done. The CRISP server will pick these up on the next E3 census snapshot.");
