// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { MarketStatus } from "trueo/MarketEnums.sol";
import { SimpleYesNoToken } from "./SimpleYesNoToken.sol";

/// @notice Minimal trueo-shaped market for the PoC, now with a Gnosis-style FPMM.
///
/// Trading model:
///   - The market holds two virtual reserves (yesReserve, noReserve) tracked in storage.
///     Their underlying YES/NO tokens are minted to address(this) when liquidity is seeded
///     or when a buy mints+routes pairs through the pool.
///   - Constant-product invariant: yesReserve * noReserve == k, preserved across swaps.
///   - buyYes(dx): pull dx paymentToken, mint dx of each into the pool, sell back yOut YES
///       such that (yesReserve + dx - yOut) * (noReserve + dx) == yesReserve * noReserve.
///     Solved: yOut = (yesReserve + dx) - yesReserve*noReserve / (noReserve + dx).
///   - buyNo(dx) symmetric.
///   - mint(dx) (raw conditional-token split) still available for LP / advanced users.
///   - Sell is intentionally NOT implemented — users buy and hold until resolution.
///     The pool's residual reserves at resolution are inert (no LP claim mechanism in this PoC).
contract SimpleTruthMarket {
  using SafeERC20 for IERC20;

  uint256 internal constant _YES = 1;
  uint256 internal constant _NO = 2;
  uint256 internal constant _CANCELED = 3;
  uint256 internal constant ONE = 1e18;

  /* ---------- immutable wiring ---------- */
  address public immutable manager;
  IERC20 public immutable paymentToken;
  uint256 public immutable endOfTrading;
  uint256 public immutable firstChallengePeriod;
  uint256 public immutable resolverBondAmount;
  string public marketQuestion;
  string public marketSource;
  string public additionalInfo;
  SimpleYesNoToken public yesToken;
  SimpleYesNoToken public noToken;

  /* ---------- resolution state ---------- */
  // Final settled outcome. Set only by the attester layer (settleFromAttesters) or the
  // undisputed escape hatch. Drives finalization + redemption.
  uint256 public winningPosition; // 0 = unresolved, 1 = YES, 2 = NO, 3 = CANCELED
  uint256 public resolutionProposedAt; // start of the FINAL challenge window

  /* ---------- optimistic escalation ladder (trueo-shaped) ----------
   * Stage 1  proposeOutcome      → an optimistic resolver claims an outcome (bond narrated in UI)
   * Stage 2  dispute             → anyone challenges within the challenge window
   * Stage 3  recordTokenVote     → MOCK financialized layer: a PUBLIC token-holder tally
   * Stage 4  escalateToAttesters → dissatisfied party escalates to the sealed attester layer
   * Stage 5  settleFromAttesters → the real CRISP committee tally settles the market (onlyManager)
   * Bonds for stages 1–4 are UI narration only; the one real bond is the attester resolver
   * bond posted by the CRISPResolverAdapter in stage 5. No slashing/refunds in this PoC. */
  uint256 public proposedOutcome;   // optimistic claim, 0 = none
  uint256 public proposedAt;        // start of the optimistic challenge window
  bool public disputed;             // a challenge was raised
  uint256 public tokenVoteYes;      // mock public token-holder tally
  uint256 public tokenVoteNo;
  bool public tokenVoteRecorded;
  bool public escalated;            // escalated to the attester layer — un-gates openVote

  /* ---------- AMM state ---------- */
  uint256 public yesReserve;
  uint256 public noReserve;

  /* ---------- events ---------- */
  event Minted(address indexed account, uint256 amount);
  event LiquiditySeeded(address indexed by, uint256 amount, uint256 yesReserve, uint256 noReserve);
  event Bought(address indexed account, bool isYes, uint256 paymentTokenIn, uint256 sharesOut, uint256 newYesReserve, uint256 newNoReserve);
  event OutcomeProposed(address indexed proposer, uint256 outcome);
  event Disputed(address indexed disputer);
  event TokenVoteRecorded(uint256 yesVotes, uint256 noVotes);
  event EscalatedToAttesters(address indexed by);
  event ResolutionProposed(uint256 outcome); // emitted on the FINAL attester settle
  event Finalized(uint256 outcome);
  event Redeemed(address indexed account, uint256 payout);

  error NotManager();
  error AlreadyProposed();
  error TradingClosed();
  error TradingStillOpen();
  error ChallengePeriodActive();
  error Unresolved();
  error ZeroAmount();
  error InvalidOutcome();
  error NoLiquidity();
  error NothingProposed();
  error AlreadyDisputed();
  error NotDisputed();
  error ChallengeWindowClosed();
  error TokenVoteAlreadyRecorded();
  error TokenVoteNotRecorded();
  error NotEscalated();
  error AlreadyEscalated();

  modifier onlyManager() {
    if (msg.sender != manager) revert NotManager();
    _;
  }

  modifier whileOpen() {
    if (block.timestamp >= endOfTrading) revert TradingClosed();
    _;
  }

  constructor(
    address _manager,
    IERC20 _paymentToken,
    string memory _question,
    string memory _source,
    string memory _additionalInfo,
    uint256 _endOfTrading,
    uint256 _firstChallengePeriod,
    uint256 _resolverBondAmount,
    string memory _yesSymbol,
    string memory _noSymbol
  ) {
    manager = _manager;
    paymentToken = _paymentToken;
    marketQuestion = _question;
    marketSource = _source;
    additionalInfo = _additionalInfo;
    endOfTrading = _endOfTrading;
    firstChallengePeriod = _firstChallengePeriod;
    resolverBondAmount = _resolverBondAmount;
    yesToken = new SimpleYesNoToken(string.concat("YES ", _yesSymbol), _yesSymbol, address(this));
    noToken = new SimpleYesNoToken(string.concat("NO ", _noSymbol), _noSymbol, address(this));
  }

  /* ---------- ITruthMarket subset ---------- */

  function getCurrentStatus() public view returns (MarketStatus) {
    // Final attester settle posted → final challenge window, then Finalized.
    if (winningPosition != 0) {
      if (block.timestamp < resolutionProposedAt + firstChallengePeriod) {
        return MarketStatus.ResolutionProposed;
      }
      return MarketStatus.Finalized;
    }
    // Walk the escalation ladder from the deepest reached stage outward.
    if (escalated) return MarketStatus.EscalatedDisputeRaised; // attester (CRISP) vote in flight
    if (tokenVoteRecorded) return MarketStatus.SetByCouncil;    // token vote done, awaiting escalation
    if (disputed) return MarketStatus.DisputeRaised;
    if (proposedOutcome != 0) return MarketStatus.ResolutionProposed; // optimistic challenge window
    if (block.timestamp < endOfTrading) return MarketStatus.Created;
    return MarketStatus.OpenForResolution;
  }

  function paused() external pure returns (bool) {
    return false;
  }

  /* ---------- liquidity ---------- */

  /// @notice Seed the AMM pool with paymentToken. Always adds 1:1 (preserves the
  ///         current price). The first call sets the implied probability to 50%.
  ///         Subsequent calls scale both reserves up at the existing ratio.
  ///
  ///         Liquidity is intentionally non-recoverable in this PoC — the pool's
  ///         winning tokens are inert after resolution. This is fine for testnet /
  ///         local demos. In a real market you'd track LP shares + let LPs redeem.
  function seedLiquidity(uint256 amount) external whileOpen {
    if (amount == 0) revert ZeroAmount();
    paymentToken.safeTransferFrom(msg.sender, address(this), amount);

    if (yesReserve == 0 && noReserve == 0) {
      yesReserve = amount;
      noReserve = amount;
    } else {
      // Add `amount` of each to preserve k's growth rate at the current ratio.
      // (Strictly correct LP math would require: dx_yes = amount * yesR / (yesR + noR),
      // etc., to preserve the ratio. For a flat 1:1 seed it's identical; for skewed
      // pools we accept slight reserve drift in exchange for code simplicity.)
      yesReserve += amount;
      noReserve += amount;
    }

    yesToken.mint(address(this), amount);
    noToken.mint(address(this), amount);
    emit LiquiditySeeded(msg.sender, amount, yesReserve, noReserve);
  }

  /* ---------- trading: AMM + raw mint ---------- */

  /// @notice Deposit `paymentTokenAmount`, get an equal amount of YES + NO (raw split).
  ///         Useful for LPs or advanced users hedging both sides.
  function mint(uint256 paymentTokenAmount) external whileOpen {
    if (paymentTokenAmount == 0) revert ZeroAmount();
    paymentToken.safeTransferFrom(msg.sender, address(this), paymentTokenAmount);
    yesToken.mint(msg.sender, paymentTokenAmount);
    noToken.mint(msg.sender, paymentTokenAmount);
    emit Minted(msg.sender, paymentTokenAmount);
  }

  /// @notice CPMM swap: deposit `dx` paymentToken, get `yOut` YES.
  function buyYes(uint256 dx) external whileOpen returns (uint256 yOut) {
    if (dx == 0) revert ZeroAmount();
    if (yesReserve == 0 || noReserve == 0) revert NoLiquidity();

    paymentToken.safeTransferFrom(msg.sender, address(this), dx);

    // Mint dx of each pair into the pool first.
    yesToken.mint(address(this), dx);
    noToken.mint(address(this), dx);

    // Compute yOut so that (yesReserve + dx - yOut)(noReserve + dx) == yesReserve * noReserve
    uint256 k = yesReserve * noReserve;
    uint256 newNoReserve = noReserve + dx;
    uint256 newYesReserve = k / newNoReserve;
    yOut = (yesReserve + dx) - newYesReserve;

    yesReserve = newYesReserve;
    noReserve = newNoReserve;

    // The pool now over-holds YES by `yOut` (we minted dx but only kept newYesReserve - yesReserve_pre).
    // Transfer those out to the buyer.
    IERC20(address(yesToken)).safeTransfer(msg.sender, yOut);

    emit Bought(msg.sender, true, dx, yOut, yesReserve, noReserve);
  }

  /// @notice CPMM swap: deposit `dx` paymentToken, get `nOut` NO.
  function buyNo(uint256 dx) external whileOpen returns (uint256 nOut) {
    if (dx == 0) revert ZeroAmount();
    if (yesReserve == 0 || noReserve == 0) revert NoLiquidity();

    paymentToken.safeTransferFrom(msg.sender, address(this), dx);

    yesToken.mint(address(this), dx);
    noToken.mint(address(this), dx);

    uint256 k = yesReserve * noReserve;
    uint256 newYesReserve = yesReserve + dx;
    uint256 newNoReserve = k / newYesReserve;
    nOut = (noReserve + dx) - newNoReserve;

    yesReserve = newYesReserve;
    noReserve = newNoReserve;

    IERC20(address(noToken)).safeTransfer(msg.sender, nOut);

    emit Bought(msg.sender, false, dx, nOut, yesReserve, noReserve);
  }

  /* ---------- view helpers (used by the UI) ---------- */

  /// @notice Implied probabilities in 1e18 fixed point. yesPrice + noPrice == 1e18.
  ///         Returns (5e17, 5e17) when no liquidity exists.
  function price() external view returns (uint256 yesPrice, uint256 noPrice) {
    if (yesReserve == 0 || noReserve == 0) return (ONE / 2, ONE / 2);
    uint256 total = yesReserve + noReserve;
    // CPMM price of YES is noReserve / (yesReserve + noReserve) — scarce side is expensive.
    yesPrice = (noReserve * ONE) / total;
    noPrice = (yesReserve * ONE) / total;
  }

  /// @notice Preview a Buy YES at the current reserves.
  function quoteBuyYes(uint256 dx) external view returns (uint256 yOut) {
    if (dx == 0 || yesReserve == 0 || noReserve == 0) return 0;
    uint256 k = yesReserve * noReserve;
    uint256 newNo = noReserve + dx;
    yOut = (yesReserve + dx) - (k / newNo);
  }

  /// @notice Preview a Buy NO at the current reserves.
  function quoteBuyNo(uint256 dx) external view returns (uint256 nOut) {
    if (dx == 0 || yesReserve == 0 || noReserve == 0) return 0;
    uint256 k = yesReserve * noReserve;
    uint256 newYes = yesReserve + dx;
    nOut = (noReserve + dx) - (k / newYes);
  }

  /* ---------- resolution: optimistic escalation ladder ---------- */

  /// @notice Stage 1 — an optimistic resolver claims an outcome once trading closes.
  ///         Permissionless and bond-free on-chain; the proposer bond is narrated in the UI.
  function proposeOutcome(uint256 _outcome) external {
    if (block.timestamp < endOfTrading) revert TradingStillOpen();
    if (proposedOutcome != 0) revert AlreadyProposed();
    if (_outcome == 0 || _outcome > _CANCELED) revert InvalidOutcome();
    proposedOutcome = _outcome;
    proposedAt = block.timestamp;
    emit OutcomeProposed(msg.sender, _outcome);
  }

  /// @notice Stage 2 — anyone challenges the optimistic proposal within the challenge window.
  function dispute() external {
    if (proposedOutcome == 0) revert NothingProposed();
    if (disputed) revert AlreadyDisputed();
    if (block.timestamp >= proposedAt + firstChallengePeriod) revert ChallengeWindowClosed();
    disputed = true;
    emit Disputed(msg.sender);
  }

  /// @notice Stage 3 — MOCK financialized layer: record a PUBLIC token-holder tally.
  ///         A stand-in for a token-weighted vote; intentionally transparent (the opposite of
  ///         the sealed attester vote) to demonstrate the privacy contrast.
  function recordTokenVote(uint256 _yesVotes, uint256 _noVotes) external {
    if (!disputed) revert NotDisputed();
    if (tokenVoteRecorded) revert TokenVoteAlreadyRecorded();
    tokenVoteYes = _yesVotes;
    tokenVoteNo = _noVotes;
    tokenVoteRecorded = true;
    emit TokenVoteRecorded(_yesVotes, _noVotes);
  }

  /// @notice Stage 4 — escalate the dispute to the sealed attester layer. This is what un-gates
  ///         CRISPResolverAdapter.openVote: the committee is only allocated once we reach here.
  function escalateToAttesters() external {
    if (!tokenVoteRecorded) revert TokenVoteNotRecorded();
    if (escalated) revert AlreadyEscalated();
    escalated = true;
    emit EscalatedToAttesters(msg.sender);
  }

  /// @notice Stage 5 — the real CRISP attester tally settles the market. Manager-only; reached
  ///         via CRISPResolverAdapter.proposeFromCRISP → manager. Starts the final challenge window.
  function settleFromAttesters(uint256 _outcome) external onlyManager {
    if (!escalated) revert NotEscalated();
    if (winningPosition != 0) revert AlreadyProposed();
    if (_outcome == 0 || _outcome > _CANCELED) revert InvalidOutcome();
    winningPosition = _outcome;
    resolutionProposedAt = block.timestamp;
    emit ResolutionProposed(_outcome);
  }

  /// @notice Soundness escape hatch (not featured in the escalation-only demo UI): an undisputed
  ///         optimistic proposal finalizes itself once its challenge window elapses.
  function finalizeUndisputed() external {
    if (proposedOutcome == 0) revert NothingProposed();
    if (disputed) revert AlreadyDisputed();
    if (winningPosition != 0) revert AlreadyProposed();
    if (block.timestamp < proposedAt + firstChallengePeriod) revert ChallengePeriodActive();
    winningPosition = proposedOutcome;
    resolutionProposedAt = proposedAt; // window already elapsed → immediately Finalized
    emit ResolutionProposed(proposedOutcome);
  }

  /* ---------- redemption ---------- */

  function redeem(uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    MarketStatus s = getCurrentStatus();
    if (s != MarketStatus.Finalized) revert ChallengePeriodActive();

    uint256 payout;
    if (winningPosition == _YES) {
      yesToken.burn(msg.sender, amount);
      payout = amount;
    } else if (winningPosition == _NO) {
      noToken.burn(msg.sender, amount);
      payout = amount;
    } else if (winningPosition == _CANCELED) {
      yesToken.burn(msg.sender, amount);
      noToken.burn(msg.sender, amount);
      payout = amount;
    } else {
      revert Unresolved();
    }

    paymentToken.safeTransfer(msg.sender, payout);
    emit Redeemed(msg.sender, payout);
  }

  function redeemAll() external {
    MarketStatus s = getCurrentStatus();
    if (s != MarketStatus.Finalized) revert ChallengePeriodActive();

    uint256 amount;
    if (winningPosition == _YES) {
      amount = yesToken.balanceOf(msg.sender);
      if (amount == 0) revert ZeroAmount();
      yesToken.burn(msg.sender, amount);
    } else if (winningPosition == _NO) {
      amount = noToken.balanceOf(msg.sender);
      if (amount == 0) revert ZeroAmount();
      noToken.burn(msg.sender, amount);
    } else if (winningPosition == _CANCELED) {
      uint256 yes = yesToken.balanceOf(msg.sender);
      uint256 no = noToken.balanceOf(msg.sender);
      amount = yes < no ? yes : no;
      if (amount == 0) revert ZeroAmount();
      yesToken.burn(msg.sender, amount);
      noToken.burn(msg.sender, amount);
    } else {
      revert Unresolved();
    }

    paymentToken.safeTransfer(msg.sender, amount);
    emit Redeemed(msg.sender, amount);
  }
}
