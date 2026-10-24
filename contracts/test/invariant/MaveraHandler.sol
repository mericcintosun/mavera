// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { Mavera } from "../../src/Mavera.sol";
import { MockUSDC } from "../MockUSDC.sol";

/// @notice Bounded handler for the Mavera invariant suite: every action is clamped so it never reverts
/// (`fail_on_revert = true`), and ghost sums record what entered, what left and what each sync floored away.
contract MaveraHandler is Test {
    uint256 public constant M = 1e36;

    Mavera public immutable mavera;
    MockUSDC public immutable usdc;
    address public immutable creator;
    address[] public actors;

    uint256 public ghost_paid; // USDC units minted into the Mavera address
    uint256 public ghost_claimed; // USDC units paid out by claim()
    uint256 public ghost_proceeds; // USDC units moved to the creator by buy()
    uint256 public ghost_R; // sum of sync remainders (P * M) mod totalSupply
    uint256 public ghost_syncs; // effective syncs (P > 0)
    uint256 public ghost_accPrev;
    uint256 public ghost_distPrev;
    mapping(address holder => uint256) public ghost_claimedPrev;
    mapping(bytes32 action => uint256) public calls;

    constructor(Mavera mavera_, MockUSDC usdc_, address[] memory actors_) {
        mavera = mavera_;
        usdc = usdc_;
        creator = mavera_.creator();
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    // ---------------------------------------------------------------- actions

    /// @dev An x402 settlement or a donation: USDC lands in the contract without any Mavera call.
    function pay(uint256 amount) external {
        amount = bound(amount, 1, 1e9);
        usdc.mint(address(mavera), amount);
        ghost_paid += amount;
        calls["pay"]++;
        _after();
    }

    function sync() external {
        _noteSync();
        mavera.sync();
        calls["sync"]++;
        // INV-11: idempotent, a second sync changes nothing and emits nothing
        assertEq(mavera.pending(), 0, "INV-11 pending after sync");
        uint256 acc = mavera.accPerShare();
        uint256 accounted = mavera.accounted();
        vm.recordLogs();
        mavera.sync();
        assertEq(vm.getRecordedLogs().length, 0, "INV-11 second sync emitted");
        assertEq(mavera.accPerShare(), acc, "INV-11 accPerShare moved");
        assertEq(mavera.accounted(), accounted, "INV-11 accounted moved");
        _after();
    }

    function buy(uint256 actorSeed, uint256 shares) external {
        address actor = _actor(actorSeed);
        uint256 room = mavera.maxSupply() - mavera.totalSupply();
        if (room == 0) {
            calls["buy_skipped"]++;
            return;
        }
        shares = bound(shares, 1, room);
        uint256 cost = Math.mulDiv(shares, mavera.sharePrice(), 1e18, Math.Rounding.Ceil);
        usdc.mint(actor, cost);
        uint256 maveraBefore = usdc.balanceOf(address(mavera));
        uint256 creatorBefore = usdc.balanceOf(creator);
        uint256 supplyBefore = mavera.totalSupply();
        _noteSync();

        vm.startPrank(actor);
        usdc.approve(address(mavera), cost);
        vm.recordLogs();
        mavera.buy(shares);
        vm.stopPrank();

        // INV-10: buy isolation
        assertEq(usdc.balanceOf(address(mavera)), maveraBefore, "INV-10 contract balance changed");
        assertEq(mavera.pending(), 0, "INV-10 pending after buy");
        assertEq(usdc.balanceOf(creator), creatorBefore + (actor == creator ? 0 : cost), "INV-10 creator proceeds");
        assertEq(mavera.totalSupply(), supplyBefore + shares, "INV-10 supply");
        // INV-13: no free shares (scan the Bought event)
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(mavera) && logs[i].topics[0] == Mavera.Bought.selector) {
                (uint256 s, uint256 c) = abi.decode(logs[i].data, (uint256, uint256));
                assertGe(s, 1, "INV-13 shares");
                assertGe(c, 1, "INV-13 cost");
                assertEq(c, cost, "INV-13 cost mismatch");
                found = true;
            }
        }
        assertTrue(found, "INV-13 Bought not emitted");
        ghost_proceeds += cost;
        calls["buy"]++;
        _after();
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        uint256 bal = mavera.balanceOf(from);
        if (bal == 0) {
            calls["transfer_skipped"]++;
            return;
        }
        amount = bound(amount, 1, bal);
        _noteSync();
        uint256 clFrom = mavera.claimable(from); // pending-inclusive == post-sync value
        uint256 clTo = mavera.claimable(to);
        vm.prank(from);
        mavera.transfer(to, amount);
        // INV-12: transfer neutrality
        assertEq(mavera.claimable(from), clFrom, "INV-12 from");
        assertEq(mavera.claimable(to), clTo, "INV-12 to");
        assertEq(mavera.pending(), 0, "transfer syncs first");
        calls["transfer"]++;
        _after();
    }

    function transferFrom(uint256 fromSeed, uint256 toSeed, uint256 spenderSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        address spender = _actor(spenderSeed);
        uint256 bal = mavera.balanceOf(from);
        if (bal == 0) {
            calls["transferFrom_skipped"]++;
            return;
        }
        amount = bound(amount, 1, bal);
        _noteSync();
        uint256 clFrom = mavera.claimable(from);
        uint256 clTo = mavera.claimable(to);
        vm.prank(from);
        mavera.approve(spender, amount);
        vm.prank(spender);
        mavera.transferFrom(from, to, amount);
        assertEq(mavera.claimable(from), clFrom, "INV-12 from");
        assertEq(mavera.claimable(to), clTo, "INV-12 to");
        calls["transferFrom"]++;
        _after();
    }

    function claim(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 expected = mavera.claimable(actor);
        if (expected == 0) {
            calls["claim_skipped"]++;
            return;
        }
        uint256 before = usdc.balanceOf(actor);
        _noteSync();
        vm.prank(actor);
        mavera.claim();
        uint256 paid = usdc.balanceOf(actor) - before;
        assertEq(paid, expected, "claim paid != claimable");
        assertEq(mavera.claimable(actor), 0, "claimable after claim");
        ghost_claimed += paid;
        calls["claim"]++;
        _after();
    }

    // ---------------------------------------------------------------- helpers

    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    /// @dev Called before every action that can sync with P > 0: records the floored remainder.
    function _noteSync() internal {
        uint256 supply = mavera.totalSupply();
        uint256 p = mavera.pending();
        if (supply > 0 && p > 0) {
            ghost_R += mulmod(p, M, supply);
            ghost_syncs += 1;
        }
    }

    /// @dev INV-9 monotonicity, checked after every action.
    function _after() internal {
        uint256 acc = mavera.accPerShare();
        uint256 dist = mavera.totalDistributed();
        assertGe(acc, ghost_accPrev, "INV-9 accPerShare decreased");
        assertGe(dist, ghost_distPrev, "INV-9 totalDistributed decreased");
        ghost_accPrev = acc;
        ghost_distPrev = dist;
        for (uint256 i = 0; i < actors.length; i++) {
            uint256 k = mavera.claimed(actors[i]);
            assertGe(k, ghost_claimedPrev[actors[i]], "INV-9 claimed decreased");
            ghost_claimedPrev[actors[i]] = k;
        }
    }
}
