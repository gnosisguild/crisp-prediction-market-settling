// Headless market creation — replaces the /create UI page for ops work.
//
// Defaults are tuned for CRISP-vote testing: 5-minute trading window so a vote
// can be opened almost immediately after create, then ~5 minutes of input window
// once openVote runs.
//
// Usage:
//   bun run create-market
//   bun run create-market "Will the test pass?" 300
//   QUESTION="..." DURATION_SEC=600 SEED_USDC=100 bun run create-market
//
// Writes MARKET=<addr> back into .env on success so subsequent `bun run prep`
// targets the newly-created market without manual copy/paste.

import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, decodeEventLog, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC = process.env.RPC ?? process.env.RPC_URL;
const PK = (process.env.DEPLOYER_KEY ?? process.env.PRIVATE_KEY) as Hex | undefined;
const MANAGER = process.env.MANAGER as Address | undefined;
const USDC = process.env.USDC as Address | undefined;

if (!RPC || !PK || !MANAGER || !USDC) {
  console.error("\n  ✗ missing env: need RPC, DEPLOYER_KEY (or PRIVATE_KEY), MANAGER, USDC in .env\n");
  process.exit(1);
}

const QUESTION = process.argv[2] ?? process.env.QUESTION ?? "Will the CRISP vote settle correctly?";
const DURATION_SEC = Number(process.argv[3] ?? process.env.DURATION_SEC ?? "300"); // 5 min default
const SOURCE = process.env.SOURCE ?? "https://github.com/gnosisguild/CRISP";
const INFO = process.env.INFO ?? "Resolved by an encrypted CRISP committee vote at close.";
const SEED_USDC = Number(process.env.SEED_USDC ?? "100"); // mUSDC seeded into AMM; 0 disables
const SEED_AMOUNT = parseUnits(String(SEED_USDC), 6);

const managerAbi = [
  {
    type: "function",
    stateMutability: "nonpayable",
    name: "createMarket",
    inputs: [
      { name: "_marketQuestion", type: "string" },
      { name: "_marketSource", type: "string" },
      { name: "_additionalInfo", type: "string" },
      { name: "_endOfTrading", type: "uint256" },
      { name: "_yesNoTokenCap", type: "uint256" },
      { name: "_rewardToken", type: "address" },
      { name: "_rewardAmount", type: "uint256" },
      { name: "_yesTokenSymbol", type: "string" },
      { name: "_noTokenSymbol", type: "string" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "endOfTrading", type: "uint256", indexed: false },
    ],
  },
] as const;

const erc20Abi = [
  { type: "function", stateMutability: "view",    name: "balanceOf", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "mint",     inputs: [{ name: "to", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "approve",  inputs: [{ name: "s", type: "address" }, { name: "amt", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

const marketAbi = [
  { type: "function", stateMutability: "nonpayable", name: "seedLiquidity", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

const account = privateKeyToAccount(PK);
const transport = http(RPC);
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ chain: sepolia, transport, account });

console.log(`creating market: "${QUESTION}"`);
console.log(`  duration: ${DURATION_SEC}s (${(DURATION_SEC / 60).toFixed(1)} min)`);
console.log(`  creator:  ${account.address}`);

const endOfTrading = BigInt(Math.floor(Date.now() / 1000) + DURATION_SEC);
const createHash = await wallet.writeContract({
  address: MANAGER,
  abi: managerAbi,
  functionName: "createMarket",
  args: [QUESTION, SOURCE, INFO, endOfTrading, 0n, "0x0000000000000000000000000000000000000000", 0n, "YES", "NO"],
});
console.log(`  createMarket tx: ${createHash}`);

const receipt = await pub.waitForTransactionReceipt({ hash: createHash });

let market: Address | undefined;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== MANAGER.toLowerCase()) continue;
  try {
    const decoded = decodeEventLog({ abi: managerAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "MarketCreated") {
      market = decoded.args.market as Address;
      break;
    }
  } catch {
    // skip unrelated logs
  }
}
if (!market) {
  console.error("✗ MarketCreated event not found in receipt — manual lookup needed");
  process.exit(1);
}
console.log(`  ✓ market: ${market}`);

if (SEED_AMOUNT > 0n) {
  console.log(`seeding ${SEED_USDC} mUSDC of AMM liquidity`);
  const bal = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (bal < SEED_AMOUNT) {
    console.log(`  minting ${SEED_USDC} mUSDC`);
    const mintHash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "mint", args: [account.address, SEED_AMOUNT] });
    await pub.waitForTransactionReceipt({ hash: mintHash });
  }
  const approveHash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [market, SEED_AMOUNT] });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  const seedHash = await wallet.writeContract({ address: market, abi: marketAbi, functionName: "seedLiquidity", args: [SEED_AMOUNT] });
  await pub.waitForTransactionReceipt({ hash: seedHash });
  console.log(`  ✓ seeded`);
}

// Write MARKET=<addr> back to .env so `bun run prep` / cast / e2e pick it up.
try {
  const envPath = ".env";
  const raw = readFileSync(envPath, "utf-8");
  const next = raw.match(/^MARKET=/m)
    ? raw.replace(/^MARKET=.*$/m, `MARKET=${market}`)
    : raw.endsWith("\n") ? `${raw}MARKET=${market}\n` : `${raw}\nMARKET=${market}\n`;
  writeFileSync(envPath, next);
  console.log(`  ✓ wrote MARKET=${market} to .env`);
} catch (e) {
  console.warn(`  ! could not update .env: ${e instanceof Error ? e.message : String(e)}`);
  console.warn(`    set MARKET=${market} manually before running prep.`);
}

console.log(`\nnext:`);
console.log(`  source .env`);
console.log(`  bun run e2e  # or: bun run prep && bun run cast YES`);
