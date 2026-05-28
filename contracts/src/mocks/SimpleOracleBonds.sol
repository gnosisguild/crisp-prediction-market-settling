// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Pulls the resolver bond from the resolver, holds it during the challenge period.
///         For the PoC we don't model slashing — bonds stay here. CRISPResolverAdapter still
///         posts the bond identically to how it would against real trueo.
contract SimpleOracleBonds {
  using SafeERC20 for IERC20;

  IERC20 public immutable paymentToken;
  address public manager;

  mapping(address market => uint256 amount) public resolverBondForMarket;

  error NotManager();
  error AlreadySet();

  constructor(IERC20 _paymentToken) {
    paymentToken = _paymentToken;
  }

  /// @notice One-shot: set the manager so it can pull bonds via this contract.
  function setManager(address _manager) external {
    if (manager != address(0)) revert AlreadySet();
    manager = _manager;
  }

  function sendResolverBondToMarket(address market, address resolver, uint256 amount) external {
    if (msg.sender != manager) revert NotManager();
    paymentToken.safeTransferFrom(resolver, address(this), amount);
    resolverBondForMarket[market] += amount;
  }

  function getResolverBondForMarket(address market) external view returns (uint256) {
    return resolverBondForMarket[market];
  }
}
