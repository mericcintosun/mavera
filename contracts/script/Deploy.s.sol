// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Mavera } from "../src/Mavera.sol";

/// @notice Deploys Mavera on Monad testnet (docs/07-RUNBOOK.md section D).
/// Environment: USDC_ADDRESS (required); CREATOR (default: broadcaster); SHARE_PRICE (10000); MAX_SUPPLY (100e18);
/// CREATOR_SHARES (60e18); TOKEN_NAME; TOKEN_SYMBOL; ENDPOINT ("/api/price").
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url $MONAD_RPC_URL --account mavera-deployer \
///     --broadcast --slow --gas-estimate-multiplier 110
///   (or --private-key $DEPLOYER_PRIVATE_KEY instead of --account; never hardcode keys)
contract Deploy is Script {
    function run() external returns (Mavera mavera) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 sharePrice = vm.envOr("SHARE_PRICE", uint256(10_000));
        uint256 maxSupply = vm.envOr("MAX_SUPPLY", uint256(100e18));
        uint256 creatorShares = vm.envOr("CREATOR_SHARES", uint256(60e18));
        string memory name = vm.envOr("TOKEN_NAME", string("Mavera Shares: MON/USD Price API"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("mPRICE"));
        string memory endpoint = vm.envOr("ENDPOINT", string("/api/price"));

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        address creator = vm.envOr("CREATOR", broadcaster);
        mavera = new Mavera(IERC20(usdc), creator, sharePrice, maxSupply, creatorShares, name, symbol, endpoint);
        vm.stopBroadcast();

        console.log("chain id        :", block.chainid);
        console.log("deployer        :", broadcaster);
        console.log("Mavera          :", address(mavera));
        console.log("usdc            :", usdc);
        console.log("creator         :", creator);
        console.log("sharePrice      :", sharePrice);
        console.log("maxSupply       :", maxSupply);
        console.log("creatorShares   :", creatorShares);
        console.log("name            :", name);
        console.log("symbol          :", symbol);
        console.log("endpoint        :", endpoint);
        console.log("constructor args (abi-encoded, pass to forge verify-contract --constructor-args):");
        console.logBytes(abi.encode(usdc, creator, sharePrice, maxSupply, creatorShares, name, symbol, endpoint));
    }
}
