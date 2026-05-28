// Minimal ABIs the CLI calls. On real CRISP, stage lives on Enclave and tally lives
// on CRISPProgram — they're separate contracts.

export const adapterAbi = [
  { type: "function", stateMutability: "view", name: "e3IdOf", inputs: [{ name: "m", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "openVote", inputs: [{ name: "market", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const enclaveAbi = [
  { type: "function", stateMutability: "view", name: "getE3Stage", inputs: [{ name: "e3Id", type: "uint256" }], outputs: [{ type: "uint8" }] },
] as const;

export const crispProgramAbi = [
  { type: "function", stateMutability: "view", name: "decodeTally", inputs: [{ name: "e3Id", type: "uint256" }], outputs: [{ type: "uint256[]" }] },
] as const;

export const E3Stage = {
  None: 0,
  Requested: 1,
  CommitteeFinalized: 2,
  KeyPublished: 3,
  CiphertextReady: 4,
  Complete: 5,
  Failed: 6,
} as const;

export function stageName(s: number): string {
  return Object.entries(E3Stage).find(([_, v]) => v === s)?.[0] ?? `unknown(${s})`;
}
