// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
  constructor() ERC20("Mock USDC", "mUSDC") {}

  function decimals() public pure override returns (uint8) {
    return 6;
  }

  /// @notice Permissionless mint — convenient for a local PoC where any user can self-fund.
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
