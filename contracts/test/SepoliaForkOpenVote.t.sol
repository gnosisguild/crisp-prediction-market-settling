// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { CRISPResolverAdapter } from "../src/CRISPResolverAdapter.sol";
import { IEnclaveMinimal, ICRISPProgramMinimal, IE3Program } from "../src/interfaces/IEnclaveMinimal.sol";
import { ITruthMarketManager } from "trueo/interfaces/ITruthMarketManager.sol";
import { MarketStatus } from "trueo/MarketEnums.sol";

import { MockUSDC } from "../src/mocks/MockUSDC.sol";
import { SimpleOracleBonds } from "../src/mocks/SimpleOracleBonds.sol";
import { SimpleTruthMarketManager } from "../src/mocks/SimpleTruthMarketManager.sol";
import { SimpleTruthMarket } from "../src/mocks/SimpleTruthMarket.sol";

/// @notice Sepolia fork test for openVote(). Fires the same call our adapter would
///         make against the user's real Enclave+CRISP deployment, so we can see
///         exactly what the revert is when iterating on the customParams shape /
///         committee size / etc.
///
/// Run:  forge test --match-contract SepoliaForkOpenVote -vvv
contract SepoliaForkOpenVote is Test {
  address constant ENCLAVE = 0xB47B267876B60a06138Bc9dfCee7aa3E26907CCB;
  address constant CRISP_PROGRAM = 0xA775f142d205ECd46a2B0F96569B1fa3acAC4476;
  address constant FEE_TOKEN = 0x9B1820D75bb09433D17C674A289fc6dD53e9c389; // sepolia USDC

  IEnclaveMinimal enclave = IEnclaveMinimal(ENCLAVE);
  IERC20 feeToken = IERC20(FEE_TOKEN);

  function setUp() public {
    string memory rpc = vm.envOr("SEPOLIA_RPC", string("https://ethereum-sepolia-rpc.publicnode.com"));
    vm.createSelectFork(rpc);
  }

  /// @notice Try Enclave.request directly with a CONSTANT-credit-mode customParams.
  ///         If this reverts, the revert reason tells us exactly what's wrong.
  function test_directEnclaveRequest_constant() public {
    // Fund this test contract with some fee token (impersonate a whale).
    address whale = 0x3F168219dadf4460dC6Ad93eaa3641340C1330D6; // some Sepolia holder
    uint256 whaleBal = feeToken.balanceOf(whale);
    console2.log("whale balance:", whaleBal);
    if (whaleBal < 1e6) {
      // try the safebox / a deploy of fresh USDC via deal
      deal(address(feeToken), address(this), 100e6, true);
    } else {
      vm.prank(whale);
      require(feeToken.transfer(address(this), 100e6), "transfer failed");
    }
    feeToken.approve(ENCLAVE, type(uint256).max);

    // Match the existing E3 #30 shape: (token, 0, numOptions, CreditMode, ?)
    bytes memory customParams = abi.encode(
      address(0),         // token (0 = no token gate for CONSTANT mode)
      uint256(0),         // unused / placeholder
      uint256(2),         // numOptions = binary
      uint256(0),         // CreditMode = CONSTANT
      uint256(1)          // 1 credit per voter
    );

    IEnclaveMinimal.E3RequestParams memory params = IEnclaveMinimal.E3RequestParams({
      committeeSize: IEnclaveMinimal.CommitteeSize.Micro,
      inputWindow: [block.timestamp + 30, block.timestamp + 30 * 60],
      e3Program: IE3Program(CRISP_PROGRAM),
      paramSet: 0,
      computeProviderParams: bytes(""),
      customParams: customParams,
      proofAggregationEnabled: false
    });

    (uint256 e3Id, ) = enclave.request(params);
    console2.log("e3Id allocated:", e3Id);
  }

  /// @notice Match the exact customParams shape used by Sepolia E3 #30 (CUSTOM mode + token).
  function test_directEnclaveRequest_matchExistingShape() public {
    address whale = 0x3F168219dadf4460dC6Ad93eaa3641340C1330D6;
    if (feeToken.balanceOf(whale) >= 100e6) {
      vm.prank(whale);
      require(feeToken.transfer(address(this), 100e6), "transfer failed");
    } else {
      deal(address(feeToken), address(this), 100e6, true);
    }
    feeToken.approve(ENCLAVE, type(uint256).max);

    // Decoded from on-chain E3 #30's customParams.
    bytes memory customParams = abi.encode(
      address(0x0B27C944c2E0EEC1A7A0ABdf2F62b2ea9198Cf9b), // DVT voting token on Sepolia
      uint256(0),
      uint256(2),         // numOptions
      uint256(1),         // CreditMode = CUSTOM
      uint256(50)         // (balance threshold?)
    );

    IEnclaveMinimal.E3RequestParams memory params = IEnclaveMinimal.E3RequestParams({
      committeeSize: IEnclaveMinimal.CommitteeSize.Micro,
      inputWindow: [block.timestamp + 30, block.timestamp + 30 * 60],
      e3Program: IE3Program(CRISP_PROGRAM),
      paramSet: 0,
      computeProviderParams: bytes(""),
      customParams: customParams,
      proofAggregationEnabled: false
    });

    (uint256 e3Id, ) = enclave.request(params);
    console2.log("e3Id allocated:", e3Id);
  }

  /// @notice Full path: deploy our mocks + adapter, create a market, time-warp past
  ///         endOfTrading, call adapter.openVote(). Mirrors what `bun run sepolia` then
  ///         `bun run open <market>` would do, so we can see the actual revert.
  function test_adapterOpenVote_endToEnd() public {
    MockUSDC paymentToken = new MockUSDC();
    SimpleOracleBonds bonds = new SimpleOracleBonds(IERC20(address(paymentToken)));
    SimpleTruthMarketManager mgr = new SimpleTruthMarketManager(
      IERC20(address(paymentToken)),
      bonds,
      10 minutes,
      10 * 1e6,
      1_000_000 * 1e6
    );
    bonds.setManager(address(mgr));

    CRISPResolverAdapter adapter = new CRISPResolverAdapter(
      CRISPResolverAdapter.ConstructorArgs({
        truthMarketManager: ITruthMarketManager(address(mgr)),
        crispProgram: ICRISPProgramMinimal(CRISP_PROGRAM),
        enclave: enclave,
        paymentToken: IERC20(address(paymentToken)),
        feeToken: feeToken,
        committeeSize: IEnclaveMinimal.CommitteeSize.Micro,
        paramSet: 0,
        proofAggregationEnabled: false,
        inputWindowDuration: 30 minutes,
        computeProviderParams: bytes(""),
        customParamsTemplate: abi.encode(address(0), uint256(0), uint256(2), uint256(0), uint256(1))
      })
    );

    uint256 endOfTrading = block.timestamp + 60;
    address market = mgr.createMarket(
      "test", "src", "info", endOfTrading, 1_000_000 * 1e6, address(0), 0, "YES", "NO"
    );

    deal(address(feeToken), address(adapter), 100e6, true);

    vm.warp(endOfTrading + 1);
    assertEq(uint256(SimpleTruthMarket(market).getCurrentStatus()), uint256(MarketStatus.OpenForResolution));

    // openVote now only works once a dispute has escalated to the attester layer. Walk the
    // optimistic ladder: propose → dispute → token vote → escalate.
    SimpleTruthMarket(market).proposeOutcome(1);
    SimpleTruthMarket(market).dispute();
    SimpleTruthMarket(market).recordTokenVote(30, 70);
    SimpleTruthMarket(market).escalateToAttesters();
    assertEq(uint256(SimpleTruthMarket(market).getCurrentStatus()), uint256(MarketStatus.EscalatedDisputeRaised));

    address caller = makeAddr("caller");
    vm.prank(caller);
    uint256 e3Id = adapter.openVote(market);

    console2.log("openVote succeeded, e3Id =", e3Id);
    assertGt(e3Id, 0);
  }
}
