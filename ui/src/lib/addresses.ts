import type { Address } from "viem";

// All addresses come from NEXT_PUBLIC_* env vars in ui/.env.local.
// After `bun run sepolia` paste the printed addresses there.

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export const ADDRESSES = {
  usdc: (process.env.NEXT_PUBLIC_USDC ?? ZERO) as Address,
  bonds: (process.env.NEXT_PUBLIC_BONDS ?? ZERO) as Address,
  manager: (process.env.NEXT_PUBLIC_MANAGER ?? ZERO) as Address,
  crispProgram: (process.env.NEXT_PUBLIC_CRISP_PROGRAM ?? ZERO) as Address,
  enclave: (process.env.NEXT_PUBLIC_ENCLAVE ?? ZERO) as Address,
  adapter: (process.env.NEXT_PUBLIC_ADAPTER ?? ZERO) as Address,
} as const;

export const isConfigured = ADDRESSES.manager !== ZERO;
