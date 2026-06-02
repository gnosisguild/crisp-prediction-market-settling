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
  // Census token the CRISP server snapshots for attester eligibility (DVT on Sepolia by default,
  // which exposes a public mint()). Hold 1 before a vote opens to be in that round's committee.
  censusToken: (process.env.NEXT_PUBLIC_CENSUS_TOKEN ?? "0x0B27C944c2E0EEC1A7A0ABdf2F62b2ea9198Cf9b") as Address,
} as const;

export const isConfigured = ADDRESSES.manager !== ZERO;
