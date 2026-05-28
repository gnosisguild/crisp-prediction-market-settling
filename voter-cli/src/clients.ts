import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";

// Sepolia-only by default. Reads from repo-root .env (bun auto-loads).
const RPC = process.env.RPC ?? process.env.RPC_URL ?? "";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 11155111);

if (!RPC) {
  console.error("✗ voter-cli: set RPC=... in .env (Sepolia RPC URL)");
  process.exit(1);
}

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 11155111 ? "Sepolia" : `Chain ${CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
});

export const CRISP_PROGRAM_ADDRESS = (process.env.CRISP_PROGRAM ?? "") as Address;
export const ADAPTER_ADDRESS = (process.env.ADAPTER ?? "") as Address;
export const ENCLAVE_ADDRESS = (process.env.ENCLAVE ?? "") as Address;

if (!ENCLAVE_ADDRESS || !CRISP_PROGRAM_ADDRESS) {
  console.error("✗ voter-cli: set ENCLAVE and CRISP_PROGRAM in .env");
  process.exit(1);
}

export function publicClient() {
  return createPublicClient({ chain, transport: http(RPC) });
}

export function walletClient() {
  const pk = process.env.VOTER_KEY ?? process.env.VOTER_PRIVATE_KEY ?? "";
  if (!pk) {
    throw new Error("VOTER_KEY not set in .env");
  }
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({ chain, transport: http(RPC), account });
}
