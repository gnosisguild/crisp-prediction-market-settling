// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITruthMarketManager } from "trueo/interfaces/ITruthMarketManager.sol";
import { CRISPResolverAdapter } from "../src/CRISPResolverAdapter.sol";
import { IEnclaveMinimal, ICRISPProgramMinimal } from "../src/interfaces/IEnclaveMinimal.sol";

import { MockUSDC } from "../src/mocks/MockUSDC.sol";
import { SimpleOracleBonds } from "../src/mocks/SimpleOracleBonds.sol";
import { SimpleTruthMarketManager } from "../src/mocks/SimpleTruthMarketManager.sol";

/// @dev The Sepolia testnet USDC at 0x9B18...c389 exposes a permissionless mint.
interface IMintableUSDC {
  function mint(address to, uint256 amount) external;
}

/// @notice Deploys the trueo-shaped mocks + CRISPResolverAdapter to Sepolia, wired
///         against the real Enclave + CRISPProgram deployed there.
///
/// Defaults match the user's existing Sepolia CRISP deployment. Override via env if needed:
///   ENCLAVE_ADDRESS       Enclave core
///   CRISP_PROGRAM_ADDRESS CRISPProgram instance
///   FEE_TOKEN_ADDRESS     ERC20 used by Enclave for E3 request fees (defaults to
///                         Sepolia USDC at 0x9B1820D75bb09433D17C674A289fc6dD53e9c389)
///
/// Run:
///   PRIVATE_KEY=0x... forge script script/DeploySepolia.s.sol \
///     --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast
contract DeploySepolia is Script {
  // --- defaults from the user's Sepolia setup ---
  address constant DEFAULT_ENCLAVE = 0xB47B267876B60a06138Bc9dfCee7aa3E26907CCB;
  address constant DEFAULT_CRISP_PROGRAM = 0xA775f142d205ECd46a2B0F96569B1fa3acAC4476;
  address constant DEFAULT_FEE_TOKEN = 0x9B1820D75bb09433D17C674A289fc6dD53e9c389; // USDC on Sepolia

  // --- adapter / market config ---
  uint256 constant FIRST_CHALLENGE_PERIOD = 10 minutes;
  uint256 constant RESOLVER_BOND = 10 * 1e6;   // 10 USDC (small for testnet)
  uint256 constant YESNO_TOKEN_CAP = 1_000_000 * 1e6;
  uint256 constant INPUT_WINDOW = 20 minutes;  // CRISP voting window length — short for demo iteration

  // Initial feeToken to seed the adapter with so openVote can pay Enclave fees several times.
  // Each E3 request costs ~5.3 USDC on Sepolia at current Enclave pricing, so 20 USDC covers
  // ~3 openVote calls. Anyone can top up later via adapter.fundFee(amount).
  uint256 constant INITIAL_FEE_FUNDING = 20 * 1e6; // 20 USDC

  function run() external {
    // Read with both new (.env) and legacy (_ADDRESS suffix) names. .env wins.
    address enclaveAddr = vm.envOr("ENCLAVE", vm.envOr("ENCLAVE_ADDRESS", DEFAULT_ENCLAVE));
    address crispAddr = vm.envOr("CRISP_PROGRAM", vm.envOr("CRISP_PROGRAM_ADDRESS", DEFAULT_CRISP_PROGRAM));
    address feeTokenAddr = vm.envOr("FEE_TOKEN", vm.envOr("FEE_TOKEN_ADDRESS", DEFAULT_FEE_TOKEN));
    // CRISP customParams.
    //
    // The CRISP server's indexer snapshots holders of CENSUS_TOKEN at E3 creation,
    // hashes them, builds the Merkle tree, and calls CRISPProgram.setMerkleRoot itself.
    // We don't have to (and CAN'T — onlyOwner, racing the server would lose).
    //
    // CREDIT_MODE controls how many credits each census member gets:
    //   0 = CONSTANT — every eligible voter gets exactly CONSTANT_CREDITS credits
    //                  regardless of token balance (one-oracle-one-vote semantics)
    //   1 = CUSTOM   — credits scale with token balance (weighted vote)
    //
    // Default: CONSTANT mode with 1 credit per voter, using DVT as the census token.
    address censusToken = vm.envOr("CENSUS_TOKEN", 0x0B27C944c2E0EEC1A7A0ABdf2F62b2ea9198Cf9b);
    uint256 creditMode = vm.envOr("CREDIT_MODE", uint256(0));            // 0 = CONSTANT
    uint256 constantCredits = vm.envOr("CONSTANT_CREDITS", uint256(1));  // 1 vote per voter

    console2.log("using ENCLAVE      :", enclaveAddr);
    console2.log("using CRISP_PROGRAM:", crispAddr);
    console2.log("using FEE_TOKEN    :", feeTokenAddr);

    uint256 pk = vm.envUint("PRIVATE_KEY");
    address deployer = vm.addr(pk);
    vm.startBroadcast(pk);

    // 1. trueo-side: mock USDC as the prediction-market paymentToken, plus our trueo-shaped
    //    market manager. We use our own MockUSDC for trueo so testnet users don't need to hold
    //    real Sepolia USDC to bet — but the *Enclave fee* still uses the real fee token.
    MockUSDC paymentToken = new MockUSDC();
    console2.log("MockUSDC (payment) :", address(paymentToken));

    SimpleOracleBonds bonds = new SimpleOracleBonds(IERC20(address(paymentToken)));
    SimpleTruthMarketManager mgr = new SimpleTruthMarketManager(
      IERC20(address(paymentToken)),
      bonds,
      FIRST_CHALLENGE_PERIOD,
      RESOLVER_BOND,
      YESNO_TOKEN_CAP
    );
    bonds.setManager(address(mgr));
    console2.log("SimpleOracleBonds   :", address(bonds));
    console2.log("SimpleTruthMarketMgr:", address(mgr));

    // 2. adapter wired to REAL Enclave + REAL CRISPProgram + REAL feeToken
    CRISPResolverAdapter adapter = new CRISPResolverAdapter(
      CRISPResolverAdapter.ConstructorArgs({
        truthMarketManager: ITruthMarketManager(address(mgr)),
        crispProgram: ICRISPProgramMinimal(crispAddr),
        enclave: IEnclaveMinimal(enclaveAddr),
        paymentToken: IERC20(address(paymentToken)),
        feeToken: IERC20(feeTokenAddr),
        committeeSize: IEnclaveMinimal.CommitteeSize.Micro,
        // Insecure
        paramSet: 0,
        proofAggregationEnabled: false,
        inputWindowDuration: INPUT_WINDOW,
        computeProviderParams: bytes(""),
        // CRISP customParams shape: (token, _, numOptions, CreditMode, constantCredits).
        // Defaults: CONSTANT mode, 1 credit/voter, binary market. Override via env.
        customParamsTemplate: abi.encode(censusToken, uint256(0), uint256(2), creditMode, constantCredits)
      })
    );
    console2.log("CRISPResolverAdapter:", address(adapter));

    // 3. Pre-fund the adapter for trueo resolver bonds (paymentToken — we mint freely).
    paymentToken.mint(address(adapter), 50 * RESOLVER_BOND);

    // 4. Pre-fund the adapter with real feeToken for Enclave E3 fees.
    //    The Sepolia USDC at DEFAULT_FEE_TOKEN exposes a public `mint(address,uint256)`,
    //    so we mint enough for the deployer and immediately fund the adapter.
    //    If feeTokenAddr is overridden to a non-mintable token, the mint will revert —
    //    fund the adapter manually in that case (cast send <adapter> "fundFee(uint256)" amount).
    uint256 deployerBalBefore = IERC20(feeTokenAddr).balanceOf(deployer);
    if (deployerBalBefore < INITIAL_FEE_FUNDING) {
      try IMintableUSDC(feeTokenAddr).mint(deployer, INITIAL_FEE_FUNDING) {
        console2.log("minted fee USDC    :", INITIAL_FEE_FUNDING);
      } catch {
        console2.log("WARN: feeToken mint() failed (not a mintable testnet token?)");
        console2.log("      top up the deployer with feeToken then call adapter.fundFee(amount)");
      }
    }
    if (IERC20(feeTokenAddr).balanceOf(deployer) >= INITIAL_FEE_FUNDING) {
      IERC20(feeTokenAddr).approve(address(adapter), INITIAL_FEE_FUNDING);
      adapter.fundFee(INITIAL_FEE_FUNDING);
      console2.log("fee funded         :", INITIAL_FEE_FUNDING);
    } else {
      console2.log("WARN: insufficient feeToken to fund adapter; top up manually");
    }

    vm.stopBroadcast();

    // Write deployment manifest. The bun wrapper (scripts/sepolia-deploy.ts) reads this
    // and merges the addresses into root .env and ui/.env so you never hand-paste them.
    _writeManifest(address(paymentToken), address(bonds), address(mgr), address(adapter), crispAddr, enclaveAddr, feeTokenAddr);
    console2.log("");
    console2.log("Wrote deployments.sepolia.json - bun wrapper will merge into .env files.");
  }

  function _writeManifest(
    address usdc,
    address bonds,
    address mgr,
    address adapter,
    address crispProgram,
    address enclaveAddr,
    address feeToken
  ) internal {
    string memory json = "{\n  \"chainId\": 11155111";
    json = string.concat(json, ",\n  \"usdc\": \"",         vm.toString(usdc),         "\"");
    json = string.concat(json, ",\n  \"bonds\": \"",        vm.toString(bonds),        "\"");
    json = string.concat(json, ",\n  \"manager\": \"",      vm.toString(mgr),          "\"");
    json = string.concat(json, ",\n  \"adapter\": \"",      vm.toString(adapter),      "\"");
    json = string.concat(json, ",\n  \"crispProgram\": \"", vm.toString(crispProgram), "\"");
    json = string.concat(json, ",\n  \"enclave\": \"",      vm.toString(enclaveAddr),  "\"");
    json = string.concat(json, ",\n  \"feeToken\": \"",     vm.toString(feeToken),     "\"\n}\n");
    vm.writeFile("../deployments.sepolia.json", json);
  }
}
