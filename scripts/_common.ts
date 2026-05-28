// Shared helpers for the bun scripts. Sepolia-only by default; reads .env.
//
// All addresses + keys come from .env. There is no local-anvil fallback —
// run `bun run sepolia` to deploy, paste the printed addresses into .env,
// then every other command reads them from there.

export const RPC = process.env.RPC ?? process.env.RPC_URL ?? "";
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);

// .env name: DEPLOYER_KEY (preferred). PRIVATE_KEY accepted for backward compat.
export const PRIVATE_KEY = process.env.DEPLOYER_KEY ?? process.env.PRIVATE_KEY ?? "";

const pick = (envNames: string[]): string =>
  envNames.map((n) => process.env[n]).find((v) => v && v.length > 0) ?? "";

export const USDC    = pick(["USDC",    "USDC_ADDRESS"]);
export const BONDS   = pick(["BONDS",   "BONDS_ADDRESS"]);
export const MANAGER = pick(["MANAGER", "MANAGER_ADDRESS"]);
export const CRISP_PROGRAM = pick(["CRISP_PROGRAM"]);
export const ADAPTER = pick(["ADAPTER", "ADAPTER_ADDRESS"]);

// ---- arg helpers ----
export function usage(name: string, args: string): never {
  console.error(`usage: bun ${name} ${args}`);
  process.exit(1);
}

export function requireArg(value: string | undefined, name: string, scriptName: string, args: string): string {
  if (!value) usage(scriptName, args);
  if (name === "market" && !value.startsWith("0x")) usage(scriptName, args);
  return value;
}

/// Market address from positional arg (if it looks 0x) or MARKET env var.
export function marketFromArgOrEnv(maybeArg: string | undefined, scriptName: string): string {
  const argLooksLikeMarket = Boolean(maybeArg?.startsWith("0x"));
  const candidate = argLooksLikeMarket ? maybeArg : process.env.MARKET;
  if (!candidate || !candidate.startsWith("0x")) {
    console.error(
      `usage: bun ${scriptName} <market-address>\n` +
        `       or set MARKET=0x... in .env (auto-loaded by bun)`,
    );
    process.exit(1);
  }
  return candidate;
}

export function marketArgConsumed(maybeArg: string | undefined): boolean {
  return Boolean(maybeArg?.startsWith("0x"));
}

export function requireDeployerKey(scriptName: string): string {
  if (!PRIVATE_KEY) {
    console.error(`\n  ✗ ${scriptName}: set DEPLOYER_KEY=0x... in .env\n`);
    process.exit(1);
  }
  return PRIVATE_KEY;
}

export function requireRpc(scriptName: string): string {
  if (!RPC) {
    console.error(`\n  ✗ ${scriptName}: set RPC=... in .env (Sepolia RPC URL)\n`);
    process.exit(1);
  }
  return RPC;
}

export function log(...x: unknown[]) {
  console.log("·", ...x);
}
