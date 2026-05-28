// Validated env loader for the orchestration scripts. Bun auto-loads ./.env at
// process start, so by the time this module is imported all the values are in
// process.env.

import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

function need(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (!v) {
    console.error(`\n  ✗ missing required env var: ${key}\n    add it to .env (see .env.example)\n`);
    process.exit(1);
  }
  return v;
}

function maybe(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function asAddr(name: string, v?: string): Address {
  if (!v || v === "" || v === "0x") {
    console.error(`\n  ✗ ${name} env var is empty — fill it in .env\n`);
    process.exit(1);
  }
  return v as Address;
}

function asKey(name: string, v?: string): Hex {
  if (!v || v === "" || v === "0x" || !v.startsWith("0x")) {
    console.error(`\n  ✗ ${name} env var is empty or malformed — fill it in .env\n`);
    process.exit(1);
  }
  return v as Hex;
}

export const ENV = {
  RPC: need("RPC", "http://127.0.0.1:8545"),
  CHAIN_ID: Number(process.env.CHAIN_ID ?? "31337"),
  ENCLAVE: maybe("ENCLAVE"),
  CRISP_PROGRAM: maybe("CRISP_PROGRAM"),
  FEE_TOKEN: maybe("FEE_TOKEN"),
  ENCLAVE_API: maybe("ENCLAVE_API"),

  USDC: maybe("USDC"),
  BONDS: maybe("BONDS"),
  MANAGER: maybe("MANAGER"),
  ADAPTER: maybe("ADAPTER"),

  MARKET: maybe("MARKET"),
  SIDE: (process.env.SIDE ?? "YES") as "YES" | "NO",
  WEIGHT: process.env.WEIGHT ?? "1",

  DEPLOYER_KEY: maybe("DEPLOYER_KEY") ?? maybe("PRIVATE_KEY"),
  VOTER_KEY: maybe("VOTER_KEY"),
  CRISP_OWNER_KEY: maybe("CRISP_OWNER_KEY"),
} as const;

export function requireMarket(): Address {
  return asAddr("MARKET", ENV.MARKET);
}
export function requireAdapter(): Address {
  return asAddr("ADAPTER", ENV.ADAPTER);
}
export function requireOracle(): Address {
  return asAddr("CRISP_PROGRAM", ENV.CRISP_PROGRAM);
}
export function requireDeployerKey(): Hex {
  return asKey("DEPLOYER_KEY (or PRIVATE_KEY)", ENV.DEPLOYER_KEY);
}
export function requireVoterKey(): Hex {
  return asKey("VOTER_KEY", ENV.VOTER_KEY);
}
export function requireOwnerKey(): Hex {
  return asKey("CRISP_OWNER_KEY", ENV.CRISP_OWNER_KEY);
}
export function requireApi(): string {
  return need("ENCLAVE_API", ENV.ENCLAVE_API).replace(/\/$/, "");
}

export function voterAddress(): Address {
  return privateKeyToAccount(requireVoterKey()).address;
}

/// Wrap a string in color escape codes for terminal pretty-print.
export const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

export function step(name: string, msg: string) {
  console.log(`\n${c.cyan("→")} ${c.bold(name)} ${c.dim(msg)}`);
}

export function ok(msg: string) {
  console.log(`  ${c.green("✓")} ${msg}`);
}

export function info(msg: string) {
  console.log(`  ${c.dim("·")} ${msg}`);
}
