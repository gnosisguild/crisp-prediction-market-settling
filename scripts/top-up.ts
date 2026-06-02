// Mint Sepolia USDC for yourself, then top up the adapter's fee-token balance
// so openVote can keep paying Enclave's request fee. Each openVote costs ~5.3 USDC.
//
// Usage: bun run top-up [amount=20]
//   amount: USDC (whole units, 6-decimal scaling applied here)
import { spawn } from "node:child_process";
import { privateKeyToAccount } from "viem/accounts";
import { ADAPTER, requireRpc, requireDeployerKey, log } from "./_common";

const amount = BigInt(process.argv[2] ?? "10000000");        // human units
const wei = amount * 1_000_000n;                       // 6 decimals
const RPC = requireRpc("run top-up");
const PK = requireDeployerKey("run top-up");
const ME = privateKeyToAccount(PK as `0x${string}`).address;
const FEE_TOKEN = process.env.FEE_TOKEN ?? "0x9B1820D75bb09433D17C674A289fc6dD53e9c389";

if (!ADAPTER || !ADAPTER.startsWith("0x")) {
  console.error("✗ set ADAPTER=0x... in .env");
  process.exit(1);
}

async function castSend(target: string, sig: string, ...args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "cast",
      ["send", target, sig, ...args, "--rpc-url", RPC, "--private-key", PK],
      { stdio: "inherit", env: process.env },
    );
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cast send exit ${code}`))));
  });
}

log(`minting ${amount} USDC to ${ME}`);
await castSend(FEE_TOKEN, "mint(address,uint256)", ME, wei.toString());

log(`approving adapter (${ADAPTER}) for ${amount} USDC`);
await castSend(FEE_TOKEN, "approve(address,uint256)", ADAPTER, wei.toString());

log(`fundFee(${amount}) into adapter`);
await castSend(ADAPTER, "fundFee(uint256)", wei.toString());

log(`✓ adapter topped up`);
