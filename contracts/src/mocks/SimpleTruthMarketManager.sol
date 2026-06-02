// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SimpleTruthMarket } from "./SimpleTruthMarket.sol";
import { SimpleOracleBonds } from "./SimpleOracleBonds.sol";

/// @notice Minimal trueo-shaped factory + resolver entrypoint for the PoC.
///         createMarket is permissionless (vs the real trueo where it's owner-gated) so any
///         demo user can spin up markets through the UI.
contract SimpleTruthMarketManager {
  IERC20 public immutable paymentToken;
  SimpleOracleBonds public immutable oracleBonds;
  uint256 public immutable firstChallengePeriod;
  uint256 public immutable resolverBondAmount;
  uint256 public immutable yesNoTokenCap;

  address[] public markets;
  mapping(address => address) public resolverAddress;

  event MarketCreated(address indexed market, address indexed creator, string question, uint256 endOfTrading);
  event ResolutionProposed(address indexed market, address indexed proposer, uint256 outcome);

  error MarketDoesNotExist(address market);
  error MarketAlreadyResolved(address market);

  constructor(
    IERC20 _paymentToken,
    SimpleOracleBonds _oracleBonds,
    uint256 _firstChallengePeriod,
    uint256 _resolverBondAmount,
    uint256 _yesNoTokenCap
  ) {
    paymentToken = _paymentToken;
    oracleBonds = _oracleBonds;
    firstChallengePeriod = _firstChallengePeriod;
    resolverBondAmount = _resolverBondAmount;
    yesNoTokenCap = _yesNoTokenCap;
  }

  /// @notice Trueo-compatible signature (V1).
  function createMarket(
    string memory _marketQuestion,
    string memory _marketSource,
    string memory _additionalInfo,
    uint256 _endOfTrading,
    uint256 /* _yesNoTokenCap */,
    address /* _rewardToken */,
    uint256 /* _rewardAmount */,
    string memory _yesTokenSymbol,
    string memory _noTokenSymbol
  ) external returns (address) {
    SimpleTruthMarket m = new SimpleTruthMarket(
      address(this),
      paymentToken,
      _marketQuestion,
      _marketSource,
      _additionalInfo,
      _endOfTrading,
      firstChallengePeriod,
      resolverBondAmount,
      _yesTokenSymbol,
      _noTokenSymbol
    );
    markets.push(address(m));
    emit MarketCreated(address(m), msg.sender, _marketQuestion, _endOfTrading);
    return address(m);
  }

  /// @notice Settle a market from the attester (CRISP) layer. Kept under the trueo-compatible
  ///         `proposeResolution` name so the CRISPResolverAdapter's ITruthMarketManager call site
  ///         is unchanged. The optimistic propose/dispute/token-vote/escalate stages happen
  ///         directly on the market; this is only the final attester settle, which posts the one
  ///         real resolver bond. Reaching here requires the market to be escalated (enforced by
  ///         SimpleTruthMarket.settleFromAttesters).
  function proposeResolution(address _market, uint256 _outcome) external {
    if (!isActiveMarket(_market)) revert MarketDoesNotExist(_market);
    SimpleTruthMarket m = SimpleTruthMarket(_market);
    if (m.winningPosition() != 0) revert MarketAlreadyResolved(_market);

    m.settleFromAttesters(_outcome);
    oracleBonds.sendResolverBondToMarket(_market, msg.sender, m.resolverBondAmount());
    resolverAddress[_market] = msg.sender;
    emit ResolutionProposed(_market, msg.sender, _outcome);
  }

  /* ---------- views the UI uses ---------- */

  function numberOfActiveMarkets() external view returns (uint256) {
    return markets.length;
  }

  function getActiveMarketAddress(uint256 i) external view returns (address) {
    return markets[i];
  }

  function isActiveMarket(address m) public view returns (bool) {
    for (uint256 i = 0; i < markets.length; i++) {
      if (markets[i] == m) return true;
    }
    return false;
  }
}
