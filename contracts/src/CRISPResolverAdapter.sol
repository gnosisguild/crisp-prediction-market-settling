// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ITruthMarketManager } from "trueo/interfaces/ITruthMarketManager.sol";
import { ITruthMarket } from "trueo/interfaces/ITruthMarket.sol";
import { MarketStatus } from "trueo/MarketEnums.sol";

import { IEnclaveMinimal, ICRISPProgramMinimal, IE3Program } from "./interfaces/IEnclaveMinimal.sol";

/// @title CRISPResolverAdapter
/// @notice Lets a CRISP encrypted vote act as the resolver for a trueo TruthMarket.
///
/// Lifecycle (just-in-time E3 model):
///   1. Owner deploys this adapter wired to a trueo TruthMarketManager + a real
///      Enclave deployment + a CRISPProgram bound to that Enclave.
///   2. Anyone creates a market via TruthMarketManager.createMarket(...). No E3 yet.
///   3. After the market's trading window closes, ANYONE calls `openVote(market)`:
///        - approves the Enclave to pull the E3 fee from this adapter's balance
///        - calls Enclave.request(E3RequestParams) — returns a fresh monotonic e3Id
///        - stores e3IdOf[market] = newE3Id
///      This is when the committee is formed and ciphernode resources are allocated.
///   4. Voters cast encrypted ballots into that E3 (off-chain via crisp-e3 SDK;
///      on-chain via CRISPProgram.publishInput).
///   5. Once the E3 reaches Complete, ANYONE calls `proposeFromCRISP(market)`:
///        - reads the decrypted tally via CRISPProgram.decodeTally
///        - posts the trueo resolver bond from this adapter's paymentToken balance
///        - calls TruthMarketManager.proposeResolution(market, outcome)
contract CRISPResolverAdapter is Ownable {
  using SafeERC20 for IERC20;

  /* ---------- immutable wiring ---------- */

  ITruthMarketManager public immutable truthMarketManager;
  ICRISPProgramMinimal public immutable crispProgram;
  IEnclaveMinimal public immutable enclave;
  IERC20 public immutable paymentToken;     // trueo resolver bond token
  IERC20 public immutable feeToken;         // Enclave E3 request fee token

  /* ---------- E3 request template (set at deploy, identical for every market) ---------- */

  IEnclaveMinimal.CommitteeSize public immutable committeeSize;
  uint8 public immutable paramSet;
  bool public immutable proofAggregationEnabled;
  uint256 public immutable inputWindowDuration;  // seconds the E3 voting window stays open
  bytes public computeProviderParams;
  bytes public customParamsTemplate;             // CRISP-specific params; numOptions=2 for binary

  /* ---------- per-binding state ---------- */

  mapping(address => uint256) public e3IdOf;
  mapping(address => bool) public proposed;
  // Timestamp openVote ran for a market. The E3 voting (input) window is
  // [voteOpenedAt, voteOpenedAt + inputWindowDuration]; the UI uses this to show how long the
  // vote runs and how long is left.
  mapping(address => uint256) public voteOpenedAt;

  /* ---------- events ---------- */

  event VoteOpened(address indexed market, uint256 indexed e3Id, address indexed opener);
  event MarketLinked(address indexed market, uint256 indexed e3Id);
  event ResolutionProposed(address indexed market, uint256 indexed e3Id, uint256 outcomePosition, uint256 yesVotes, uint256 noVotes);
  event BondFunded(address indexed from, uint256 amount);
  event FeeFunded(address indexed from, uint256 amount);
  event BondWithdrawn(address indexed to, uint256 amount);
  event FeeWithdrawn(address indexed to, uint256 amount);

  /* ---------- errors ---------- */

  error MarketAlreadyHasVote(address market);
  error MarketHasNoVote(address market);
  error AlreadyProposed(address market);
  error E3NotComplete(uint256 e3Id, IEnclaveMinimal.E3Stage actual);
  error UnexpectedTallyLength(uint256 length);
  error InsufficientBondBalance(uint256 have, uint256 need);
  error TradingStillOpen(address market, MarketStatus actualStatus);

  struct ConstructorArgs {
    ITruthMarketManager truthMarketManager;
    ICRISPProgramMinimal crispProgram;
    IEnclaveMinimal enclave;
    IERC20 paymentToken;
    IERC20 feeToken;
    IEnclaveMinimal.CommitteeSize committeeSize;
    uint8 paramSet;
    bool proofAggregationEnabled;
    uint256 inputWindowDuration;
    bytes computeProviderParams;
    bytes customParamsTemplate;
  }

  constructor(ConstructorArgs memory args) Ownable(msg.sender) {
    truthMarketManager = args.truthMarketManager;
    crispProgram = args.crispProgram;
    enclave = args.enclave;
    paymentToken = args.paymentToken;
    feeToken = args.feeToken;
    committeeSize = args.committeeSize;
    paramSet = args.paramSet;
    proofAggregationEnabled = args.proofAggregationEnabled;
    inputWindowDuration = args.inputWindowDuration;
    computeProviderParams = args.computeProviderParams;
    customParamsTemplate = args.customParamsTemplate;
  }

  /// @notice Permissionlessly open the CRISP vote for a market.
  /// @dev Reverts if a vote is already open, or if trading hasn't closed yet. Calls
  ///      real Enclave.request(...) under the hood, which assigns a monotonic e3Id and
  ///      pulls the configured fee from this adapter's feeToken balance.
  function openVote(address market) external returns (uint256 e3Id) {
    if (e3IdOf[market] != 0) revert MarketAlreadyHasVote(market);

    // Stage gate: the CRISP attester committee is only allocated once a dispute has escalated
    // past the public token-holder vote. The market signals this with EscalatedDisputeRaised.
    // This is the just-in-time inversion: voting happens on escalation, not at trading close.
    MarketStatus s = ITruthMarket(market).getCurrentStatus();
    if (s != MarketStatus.EscalatedDisputeRaised) revert TradingStillOpen(market, s);

    // Build the E3 request from our deploy-time template.
    uint256[2] memory window = [block.timestamp, block.timestamp + inputWindowDuration];
    IEnclaveMinimal.E3RequestParams memory params = IEnclaveMinimal.E3RequestParams({
      committeeSize: committeeSize,
      inputWindow: window,
      e3Program: IE3Program(address(crispProgram)),
      paramSet: paramSet,
      computeProviderParams: computeProviderParams,
      customParams: customParamsTemplate,
      proofAggregationEnabled: proofAggregationEnabled
    });

    // Enclave will transferFrom feeToken from this adapter. Approve generously — Enclave
    // pulls exactly the quote it computes internally; any over-approval is bounded by the
    // adapter's own feeToken balance, which is operator-controlled via fundFee/withdrawFee.
    uint256 feeBal = feeToken.balanceOf(address(this));
    feeToken.forceApprove(address(enclave), feeBal);

    (e3Id, ) = enclave.request(params);
    e3IdOf[market] = e3Id;
    voteOpenedAt[market] = block.timestamp;
    emit VoteOpened(market, e3Id, msg.sender);
  }

  /// @notice Owner-only escape hatch: bind a pre-existing e3Id (e.g. one created out of
  ///         band, or recovering a market whose openVote failed mid-flight). NOT the
  ///         canonical entrypoint — use `openVote`.
  function linkMarket(address market, uint256 e3Id) external onlyOwner {
    if (e3IdOf[market] != 0) revert MarketAlreadyHasVote(market);
    e3IdOf[market] = e3Id;
    emit MarketLinked(market, e3Id);
  }

  /// @notice Permissionlessly propose the CRISP-derived outcome to trueo.
  function proposeFromCRISP(address market) external {
    uint256 e3Id = e3IdOf[market];
    if (e3Id == 0) revert MarketHasNoVote(market);
    if (proposed[market]) revert AlreadyProposed(market);

    IEnclaveMinimal.E3Stage stage = enclave.getE3Stage(e3Id);
    if (stage != IEnclaveMinimal.E3Stage.Complete) revert E3NotComplete(e3Id, stage);

    uint256[] memory tally = crispProgram.decodeTally(e3Id);
    if (tally.length != 2) revert UnexpectedTallyLength(tally.length);

    uint256 yesVotes = tally[0];
    uint256 noVotes = tally[1];

    // 1 = YES, 2 = NO, 3 = CANCELED. Ties / zero turnout treated as cancellation.
    uint256 outcomePosition;
    if (yesVotes == 0 && noVotes == 0) {
      outcomePosition = 3;
    } else if (yesVotes > noVotes) {
      outcomePosition = 1;
    } else if (noVotes > yesVotes) {
      outcomePosition = 2;
    } else {
      outcomePosition = 3;
    }

    uint256 bond = ITruthMarket(market).resolverBondAmount();
    uint256 bal = paymentToken.balanceOf(address(this));
    if (bal < bond) revert InsufficientBondBalance(bal, bond);

    address bondsContract = truthMarketManager.oracleBonds();
    paymentToken.forceApprove(bondsContract, bond);

    proposed[market] = true;
    truthMarketManager.proposeResolution(market, outcomePosition);

    emit ResolutionProposed(market, e3Id, outcomePosition, yesVotes, noVotes);
  }

  /* ---------- bond + fee management ---------- */

  function fundBond(uint256 amount) external {
    paymentToken.safeTransferFrom(msg.sender, address(this), amount);
    emit BondFunded(msg.sender, amount);
  }

  function fundFee(uint256 amount) external {
    feeToken.safeTransferFrom(msg.sender, address(this), amount);
    emit FeeFunded(msg.sender, amount);
  }

  function withdrawBond(address to, uint256 amount) external onlyOwner {
    paymentToken.safeTransfer(to, amount);
    emit BondWithdrawn(to, amount);
  }

  function withdrawFee(address to, uint256 amount) external onlyOwner {
    feeToken.safeTransfer(to, amount);
    emit FeeWithdrawn(to, amount);
  }
}
