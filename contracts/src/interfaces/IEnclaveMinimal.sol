// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

/// @notice Minimal subset of the Enclave / CRISP surface the adapter needs.
///         Vendored here so the PoC repo doesn't depend on the full Enclave monorepo.
///         Structurally identical to the real types in
///         packages/enclave-contracts/contracts/interfaces/IE3.sol + IEnclave.sol.

/// Opaque marker interfaces — the adapter never calls methods on these, but they're
/// needed for the E3 struct layout to ABI-decode correctly when calling real Enclave.
interface IE3Program {}
interface IDecryptionVerifier {}
interface IPkVerifier {}

interface IEnclaveMinimal {
  enum E3Stage {
    None,
    Requested,
    CommitteeFinalized,
    KeyPublished,
    CiphertextReady,
    Complete,
    Failed
  }

  enum CommitteeSize {
    Micro,
    Tiny,
    Small,
    Standard,
    Large,
    XLarge
  }

  /// Layout MUST match real IE3.E3 — Enclave.request returns this struct as the
  /// second return value. The adapter discards it; only the e3Id (first return) matters.
  struct E3 {
    uint256 seed;
    CommitteeSize committeeSize;
    uint256 requestBlock;
    uint256[2] inputWindow;
    bytes32 encryptionSchemeId;
    IE3Program e3Program;
    uint8 paramSet;
    bytes customParams;
    IDecryptionVerifier decryptionVerifier;
    IPkVerifier pkVerifier;
    bytes32 committeePublicKey;
    bytes32 ciphertextOutput;
    bytes plaintextOutput;
    address requester;
    bool proofAggregationEnabled;
  }

  struct E3RequestParams {
    CommitteeSize committeeSize;
    uint256[2] inputWindow;
    IE3Program e3Program;
    uint8 paramSet;
    bytes computeProviderParams;
    bytes customParams;
    bool proofAggregationEnabled;
  }

  /// @notice E3 lifecycle stage.
  function getE3Stage(uint256 e3Id) external view returns (E3Stage);

  /// @notice Allocate a fresh E3. Pulls feeToken from the caller per Enclave's
  ///         configured pricing.
  function request(E3RequestParams calldata params) external returns (uint256 e3Id, E3 memory e3);

  /// @notice The ERC20 used to pay E3 fees on this Enclave instance.
  function feeToken() external view returns (address);
}

interface ICRISPProgramMinimal {
  /// @notice Returns the per-option vote counts after the E3 has completed.
  ///         For a binary market we use convention: tally[0] = YES, tally[1] = NO.
  function decodeTally(uint256 e3Id) external view returns (uint256[] memory);
}
