// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MarketStatus } from "trueo/MarketEnums.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";
import { SimpleOracleBonds } from "../src/mocks/SimpleOracleBonds.sol";
import { SimpleTruthMarketManager } from "../src/mocks/SimpleTruthMarketManager.sol";
import { SimpleTruthMarket } from "../src/mocks/SimpleTruthMarket.sol";

/// @notice Local (no-fork) test of the optimistic escalation ladder state machine:
///   propose → dispute → token vote → escalate → settle (attesters) → finalize → redeem.
///   The attester settle is driven via the manager (standing in for the CRISPResolverAdapter,
///   which needs a real Enclave and is covered by the Sepolia fork test).
///
/// Run:  forge test --match-contract EscalationLadder -vvv
contract EscalationLadderTest is Test {
  uint256 constant YES = 1;
  uint256 constant NO = 2;
  uint256 constant BOND = 10 * 1e6;
  uint256 constant CHALLENGE = 10 minutes;

  MockUSDC usdc;
  SimpleOracleBonds bonds;
  SimpleTruthMarketManager mgr;
  SimpleTruthMarket market;

  address user = makeAddr("user");      // holds YES tokens, redeems at the end
  address proposer = makeAddr("proposer");
  address disputer = makeAddr("disputer");
  address resolver = makeAddr("resolver"); // posts the attester bond via the manager
  uint256 endOfTrading;

  function setUp() public {
    usdc = new MockUSDC();
    bonds = new SimpleOracleBonds(IERC20(address(usdc)));
    mgr = new SimpleTruthMarketManager(IERC20(address(usdc)), bonds, CHALLENGE, BOND, 1_000_000 * 1e6);
    bonds.setManager(address(mgr));

    endOfTrading = block.timestamp + 60;
    market = SimpleTruthMarket(
      mgr.createMarket("q", "src", "info", endOfTrading, 1_000_000 * 1e6, address(0), 0, "YES", "NO")
    );

    // user splits 100 USDC into 100 YES + 100 NO; the market now holds 100 USDC to pay redemptions.
    usdc.mint(user, 100e6);
    vm.startPrank(user);
    usdc.approve(address(market), type(uint256).max);
    market.mint(100e6);
    vm.stopPrank();
  }

  function _status() internal view returns (MarketStatus) {
    return market.getCurrentStatus();
  }

  function test_fullLadder_proposeDisputeTokenVoteEscalateSettleRedeem() public {
    // Stage 0: cannot propose while trading is open.
    vm.expectRevert(SimpleTruthMarket.TradingStillOpen.selector);
    market.proposeOutcome(YES);

    vm.warp(endOfTrading + 1);
    assertEq(uint256(_status()), uint256(MarketStatus.OpenForResolution));

    // Stage 1: optimistic proposal.
    vm.prank(proposer);
    market.proposeOutcome(YES);
    assertEq(market.proposedOutcome(), YES);
    assertEq(uint256(_status()), uint256(MarketStatus.ResolutionProposed));

    // Cannot skip ahead: settle requires escalation, escalation requires a token vote, etc.
    vm.expectRevert(SimpleTruthMarket.TokenVoteNotRecorded.selector);
    market.escalateToAttesters();

    // Stage 2: dispute.
    vm.prank(disputer);
    market.dispute();
    assertTrue(market.disputed());
    assertEq(uint256(_status()), uint256(MarketStatus.DisputeRaised));

    // Stage 3: public (mock) token-holder vote.
    market.recordTokenVote(30, 70);
    assertEq(market.tokenVoteYes(), 30);
    assertEq(market.tokenVoteNo(), 70);
    assertEq(uint256(_status()), uint256(MarketStatus.SetByCouncil));

    // Stage 4: escalate to the sealed attester layer.
    market.escalateToAttesters();
    assertTrue(market.escalated());
    assertEq(uint256(_status()), uint256(MarketStatus.EscalatedDisputeRaised));

    // Stage 5: attester settle via the manager (posts the one real bond). The attester tally
    // here lands on YES — note it overrides the public token vote, which leaned NO.
    usdc.mint(resolver, BOND);
    vm.startPrank(resolver);
    usdc.approve(address(bonds), BOND);
    mgr.proposeResolution(address(market), YES);
    vm.stopPrank();

    assertEq(market.winningPosition(), YES);
    assertEq(bonds.getResolverBondForMarket(address(market)), BOND);
    assertEq(uint256(_status()), uint256(MarketStatus.ResolutionProposed)); // final challenge window

    // Redeem is blocked until the final challenge window elapses.
    vm.prank(user);
    vm.expectRevert(SimpleTruthMarket.ChallengePeriodActive.selector);
    market.redeemAll();

    vm.warp(block.timestamp + CHALLENGE + 1);
    assertEq(uint256(_status()), uint256(MarketStatus.Finalized));

    // Stage 6: winning (YES) holder redeems 100 USDC.
    uint256 before = usdc.balanceOf(user);
    vm.prank(user);
    market.redeemAll();
    assertEq(usdc.balanceOf(user) - before, 100e6);
  }

  function test_settleRevertsBeforeEscalation() public {
    vm.warp(endOfTrading + 1);
    vm.prank(proposer);
    market.proposeOutcome(YES);

    usdc.mint(resolver, BOND);
    vm.startPrank(resolver);
    usdc.approve(address(bonds), BOND);
    // settleFromAttesters reverts NotEscalated, bubbled through the manager.
    vm.expectRevert(SimpleTruthMarket.NotEscalated.selector);
    mgr.proposeResolution(address(market), YES);
    vm.stopPrank();
  }

  function test_disputeRevertsAfterChallengeWindow() public {
    vm.warp(endOfTrading + 1);
    vm.prank(proposer);
    market.proposeOutcome(YES);

    vm.warp(block.timestamp + CHALLENGE + 1);
    vm.prank(disputer);
    vm.expectRevert(SimpleTruthMarket.ChallengeWindowClosed.selector);
    market.dispute();
  }

  function test_undisputedFinalizeEscapeHatch() public {
    vm.warp(endOfTrading + 1);
    vm.prank(proposer);
    market.proposeOutcome(YES);

    // No dispute; after the challenge window the optimistic proposal finalizes itself.
    vm.warp(block.timestamp + CHALLENGE + 1);
    market.finalizeUndisputed();
    assertEq(market.winningPosition(), YES);
    assertEq(uint256(_status()), uint256(MarketStatus.Finalized));
  }
}
