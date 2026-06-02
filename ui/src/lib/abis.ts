// Hand-curated ABI fragments — only the functions/events the UI calls.

export const managerAbi = [
  { type: "function", stateMutability: "view", name: "numberOfActiveMarkets", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "getActiveMarketAddress", inputs: [{ name: "i", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "resolverAddress", inputs: [{ name: "m", type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "paymentToken", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "resolverBondAmount", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "firstChallengePeriod", inputs: [], outputs: [{ type: "uint256" }] },
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

export const marketAbi = [
  { type: "function", stateMutability: "view", name: "marketQuestion", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "marketSource", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "additionalInfo", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "endOfTrading", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "firstChallengePeriod", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "resolverBondAmount", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "winningPosition", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "resolutionProposedAt", inputs: [], outputs: [{ type: "uint256" }] },
  // optimistic escalation ladder state
  { type: "function", stateMutability: "view", name: "proposedOutcome", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "proposedAt", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "disputed", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "tokenVoteYes", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "tokenVoteNo", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "tokenVoteRecorded", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "escalated", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "yesToken", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "noToken", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "paymentToken", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", stateMutability: "view", name: "getCurrentStatus", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "yesReserve", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "noReserve", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "price", inputs: [], outputs: [{ type: "uint256", name: "yesPrice" }, { type: "uint256", name: "noPrice" }] },
  { type: "function", stateMutability: "view", name: "quoteBuyYes", inputs: [{ name: "dx", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "quoteBuyNo", inputs: [{ name: "dx", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "mint", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "buyYes", inputs: [{ name: "dx", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "buyNo", inputs: [{ name: "dx", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "seedLiquidity", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "redeem", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "redeemAll", inputs: [], outputs: [] },
  // optimistic escalation ladder actions (all permissionless)
  { type: "function", stateMutability: "nonpayable", name: "proposeOutcome", inputs: [{ name: "outcome", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "dispute", inputs: [], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "recordTokenVote", inputs: [{ name: "yesVotes", type: "uint256" }, { name: "noVotes", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "escalateToAttesters", inputs: [], outputs: [] },
] as const;

export const erc20Abi = [
  { type: "function", stateMutability: "view", name: "name", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "symbol", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "balanceOf", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "allowance", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "approve", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "nonpayable", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "nonpayable", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "a", type: "uint256" }], outputs: [] },
] as const;

export const adapterAbi = [
  { type: "function", stateMutability: "view", name: "e3IdOf", inputs: [{ name: "m", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "proposed", inputs: [{ name: "m", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "voteOpenedAt", inputs: [{ name: "m", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "inputWindowDuration", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "openVote", inputs: [{ name: "market", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "nonpayable", name: "linkMarket", inputs: [{ name: "market", type: "address" }, { name: "e3Id", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "proposeFromCRISP", inputs: [{ name: "market", type: "address" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "fundBond", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  {
    type: "event",
    name: "VoteOpened",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "e3Id", type: "uint256", indexed: true },
      { name: "opener", type: "address", indexed: true },
    ],
  },
] as const;

// CRISPProgram on Sepolia — only decodeTally lives here.
export const crispProgramAbi = [
  { type: "function", stateMutability: "view", name: "decodeTally", inputs: [{ name: "e3Id", type: "uint256" }], outputs: [{ type: "uint256[]" }] },
] as const;

// Enclave — owns E3 stage.
export const enclaveAbi = [
  { type: "function", stateMutability: "view", name: "getE3Stage", inputs: [{ name: "e3Id", type: "uint256" }], outputs: [{ type: "uint8" }] },
] as const;

// Match SimpleTruthMarket / trueo MarketStatus enum.
export const MarketStatus = {
  Created: 0,
  OpenForResolution: 1,
  ResolutionProposed: 2,
  DisputeRaised: 3,
  SetByCouncil: 4,
  ResetByCouncil: 5,
  EscalatedDisputeRaised: 6,
  Finalized: 7,
} as const;

export const E3Stage = {
  None: 0,
  Requested: 1,
  CommitteeFinalized: 2,
  KeyPublished: 3,
  CiphertextReady: 4,
  Complete: 5,
  Failed: 6,
} as const;
