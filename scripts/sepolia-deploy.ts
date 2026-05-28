// Deploy the trueo-shaped mocks + CRISPResolverAdapter to Sepolia, wired to
// real Enclave + real CRISPProgram. Also mints Sepolia USDC for the deployer,
// seeds the adapter with fee USDC + paymentToken reserves, and (if VOTERS is set
// in .env) mints 1 CENSUS_TOKEN to each oracle wallet.
//
// Required env (.env at repo root): DEPLOYER_KEY, RPC (optional, defaults to public Sepolia)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { requireDeployerKey } from "./_common";
import { mergeEnv } from "./_env_merge";

const PRIVATE_KEY = requireDeployerKey("run sepolia");
const RPC = process.env.RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
const sender = privateKeyToAccount(PRIVATE_KEY as `0x${string}`).address;

console.log(`deployer: ${sender}`);
console.log(`rpc:      ${RPC}`);

// ---------- step 1: forge script (deploy + seed adapter) ----------
const proc = spawn(
  "forge",
  [
    "script", "script/DeploySepolia.s.sol",
    "--rpc-url", RPC,
    "--private-key", PRIVATE_KEY,
    "--sender", sender,
    "--broadcast",
  ],
  {
    cwd: "contracts",
    stdio: "inherit",
    env: {
      ...process.env,
      PRIVATE_KEY,                          // DeploySepolia.s.sol reads via vm.envUint
      FOUNDRY_DISABLE_NIGHTLY_WARNING: "1",
    },
  },
);

proc.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);

  // ---------- step 2: merge deployed addresses into .env files ----------
  const manifestPath = "deployments.sepolia.json";
  if (!existsSync(manifestPath)) {
    console.error(`\n✗ ${manifestPath} not found — DeploySepolia.s.sol failed to write it.`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    usdc: string; bonds: string; manager: string; adapter: string;
  };

  // Only merge what we actually deployed. CRISP_PROGRAM + ENCLAVE are external
  // — the user controls those in .env and we must not overwrite them.
  mergeEnv(".env", {
    USDC: m.usdc,
    BONDS: m.bonds,
    MANAGER: m.manager,
    ADAPTER: m.adapter,
  });
  console.log(`\n✓ updated .env with deployed addresses`);

  mergeEnv("ui/.env", {
    NEXT_PUBLIC_USDC: m.usdc,
    NEXT_PUBLIC_BONDS: m.bonds,
    NEXT_PUBLIC_MANAGER: m.manager,
    NEXT_PUBLIC_ADAPTER: m.adapter,
    NEXT_PUBLIC_CHAIN_ID: "11155111",
  });
  console.log(`✓ updated ui/.env with deployed addresses`);

  // manifest is the source of truth for the just-completed deploy; delete so old
  // addresses can't bleed into a future merge if a later deploy partially fails.
  unlinkSync(manifestPath);

  // ---------- step 3: fund the oracle roster (if any) ----------
  const oracles = (process.env.VOTERS ?? "").split(",").map((a) => a.trim()).filter((a) => a.startsWith("0x"));
  if (oracles.length === 0) {
    console.log("\n(VOTERS env unset — skipping oracle funding. Run `bun run fund-voters` later if needed.)");
    process.exit(0);
  }

  console.log(`\n→ funding ${oracles.length} oracle wallet${oracles.length === 1 ? "" : "s"} with 1 CENSUS_TOKEN each`);
  const fund = spawnSync("bun", ["scripts/fund-voters.ts"], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(fund.status ?? 0);
});
