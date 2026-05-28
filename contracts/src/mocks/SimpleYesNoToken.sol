// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Outcome token (YES or NO) for a single SimpleTruthMarket.
contract SimpleYesNoToken is ERC20 {
  address public immutable market;

  error OnlyMarket();

  constructor(string memory name_, string memory symbol_, address market_) ERC20(name_, symbol_) {
    market = market_;
  }

  function mint(address to, uint256 amount) external {
    if (msg.sender != market) revert OnlyMarket();
    _mint(to, amount);
  }

  function burn(address from, uint256 amount) external {
    if (msg.sender != market) revert OnlyMarket();
    _burn(from, amount);
  }
}
