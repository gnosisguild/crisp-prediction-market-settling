// One-shot end-to-end smoke test: create a market → wait for trading close →
// top up the adapter → openVote → wait for committee DKG → fetch round.json →
// cast a vote via the CRISP server's /voting/broadcast relay.
//
// Usage:
//   bun run fresh
//   SKIP_CREATE=1 bun run fresh        # reuse current MARKET
//   SIDE=NO bun run fresh              # vote NO instead of YES
//   DURATION_SEC=60 bun run fresh      # 1-min trading window
//   TOPUP_USDC=50 bun run fresh        # larger top-up

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createPublicClient, http, type Address, type Hex } from "viem";

const RPC = process.env.RPC ?? process.env.RPC_URL;
const ENCLAVE = process.env.ENCLAVE as Address | undefined;
const ADAPTER = process.env.ADAPTER as Address | undefined;
const VOTER_KEY = process.env.VOTER_KEY as Hex | undefined;
const SIDE = (process.env.SIDE ?? "YES").toUpperCase() as "YES" | "NO";
const ENCLAVE_API = process.env.ENCLAVE_API ?? "https://crisp-api.enclave.gg";
const SKIP_CREATE = process.env.SKIP_CREATE === "1";

if (!RPC || !ENCLAVE || !ADAPTER || !VOTER_KEY) {
  console.error("✗ need RPC, ENCLAVE, ADAPTER, VOTER_KEY in .env");
  process.exit(1);
}

const pub = createPublicClient({ transport: http(RPC) });

function step(label: string): void {
  console.log(`\n━━━ ${label}`);
}

async function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: process.env, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exit ${code}`))));
  });
}

async function castU256(address: Address, sig: string, args: string[] = []): Promise<bigint> {
  return new Promise((resolve, reject) => {
    let out = "";
    const p = spawn("cast", ["call", address, sig, ...args, "--rpc-url", RPC!], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("exit", (code) => (code === 0 ? resolve(BigInt(out.trim().split(/\s+/)[0])) : reject(new Error(`cast call exit ${code}`))));
  });
}

function reloadEnv(): void {
  // Re-read .env so MARKET= written by create-market is visible to this process.
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs: number, pollMs = 5000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v !== null) return v;
    process.stdout.write(`  ${label}… (${Math.floor((Date.now() - start) / 1000)}s)\r`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`timeout waiting for ${label}`);
}

// 1. market
if (!SKIP_CREATE) {
  step("creating fresh market");
  await run("bun", ["scripts/create-market.ts"]);
  reloadEnv();
} else {
  step("reusing existing MARKET (SKIP_CREATE=1)");
}
const MARKET = process.env.MARKET as Address;
console.log(`  MARKET=${MARKET}`);

// 2. wait for trading to close
const endOfTrading = await castU256(MARKET, "endOfTrading()(uint256)");
const nowSec = BigInt(Math.floor(Date.now() / 1000));
if (nowSec < endOfTrading) {
  const waitS = Number(endOfTrading - nowSec) + 5;
  step(`waiting ${waitS}s for trading window to close`);
  await new Promise((r) => setTimeout(r, waitS * 1000));
}

// 3. openVote (top up first so the request fee is covered)
let e3Id = await castU256(ADAPTER, "e3IdOf(address)(uint256)", [MARKET]);
if (e3Id === 0n) {
  step("escalation ladder (propose → dispute → token vote → escalate)");
  await run("bun", ["scripts/ladder.ts", MARKET]);

  step("topping up adapter fee balance");
  await run("bun", ["scripts/top-up.ts", process.env.TOPUP_USDC ?? "20"]);

  step("opening CRISP vote");
  await run("bun", ["voter-cli/src/cli.ts", "open", "--market", MARKET]);
  e3Id = await castU256(ADAPTER, "e3IdOf(address)(uint256)", [MARKET]);
}
console.log(`  e3Id=${e3Id}`);

// 4. wait for KeyPublished
step(`waiting for committee DKG (e3Id=${e3Id})`);
await waitFor(
  "DKG",
  async () => {
    const stage = await castU256(ENCLAVE, "getE3Stage(uint256)(uint8)", [e3Id.toString()]);
    return stage >= 3n ? stage : null;
  },
  10 * 60 * 1000,
);
console.log(`\n  ✓ committee key published`);

// 5. fetch round.json
step("fetching round.json from CRISP server");
const roundPath = `/tmp/crisp-round-${MARKET.slice(2, 10)}.json`;
await run("bun", [
  "voter-cli/src/cli.ts", "fetch-round",
  "--market", MARKET,
  "--enclave-api", ENCLAVE_API,
  "--out", roundPath,
  "--balance", "1",
]);

// 6. cast vote (broadcasts via CRISP server /voting/broadcast)
step("casting vote");
await run("bun", [
  "voter-cli/src/cli.ts", "vote-real",
  "--market", MARKET,
  "--side", SIDE,
  "--weight", "1",
  "--round-data", roundPath,
  "--enclave-api", ENCLAVE_API,
]);

console.log(`\n✓ vote submitted on chain for market ${MARKET} (e3Id=${e3Id})`);
