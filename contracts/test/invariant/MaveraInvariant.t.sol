// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Mavera } from "../../src/Mavera.sol";
import { MockUSDC } from "../MockUSDC.sol";
import { MaveraHandler } from "./MaveraHandler.sol";

/// @notice Invariant suite (docs/02-CONTRACT-SPEC.md section 12, docs/05-TEST-PLAN.md). Only the handler is
/// targeted; H = 6 actors (creator + 5). E(h) and the stored-basis claimable are recomputed from public getters.
contract MaveraInvariantTest is Test {
    uint256 internal constant M = 1e36;
    uint256 internal constant SHARE_PRICE = 10_000;
    uint256 internal constant MAX_SUPPLY = 1000e18;
    uint256 internal constant CREATOR_SHARES = 60e18;
    uint256 internal constant H = 6;

    MockUSDC internal usdc;
    Mavera internal mavera;
    MaveraHandler internal handler;
    address internal creator;
    address[] internal actors;

    function setUp() public {
        usdc = new MockUSDC();
        creator = makeAddr("creator");
        mavera = new Mavera(
            IERC20(address(usdc)),
            creator,
            SHARE_PRICE,
            MAX_SUPPLY,
            CREATOR_SHARES,
            "Mavera Shares: MON/USD Price API",
            "mPRICE",
            "/api/price"
        );
        actors.push(creator);
        for (uint256 i = 1; i < H; i++) {
            actors.push(makeAddr(string(abi.encodePacked("actor", vm.toString(i)))));
        }
        handler = new MaveraHandler(mavera, usdc, actors);

        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = handler.pay.selector;
        selectors[1] = handler.sync.selector;
        selectors[2] = handler.buy.selector;
        selectors[3] = handler.transfer.selector;
        selectors[4] = handler.transferFrom.selector;
        selectors[5] = handler.claim.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    // ---------------------------------------------------------------- helpers

    function _entitlement(address h) internal view returns (int256) {
        return SafeCast.toInt256(mavera.accPerShare() * mavera.balanceOf(h)) + mavera.corrections(h);
    }

    function _clStored(address h) internal view returns (uint256) {
        int256 e = _entitlement(h);
        if (e <= 0) return 0;
        return SafeCast.toUint256(e) / M - mavera.claimed(h);
    }

    function _sums()
        internal
        view
        returns (uint256 sumClStored, uint256 sumClaimable, uint256 sumClaimed, int256 sumE, uint256 sumRho)
    {
        for (uint256 i = 0; i < actors.length; i++) {
            int256 e = _entitlement(actors[i]);
            sumE += e;
            sumRho += SafeCast.toUint256(e) % M;
            sumClStored += _clStored(actors[i]);
            sumClaimable += mavera.claimable(actors[i]);
            sumClaimed += mavera.claimed(actors[i]);
        }
    }

    // ------------------------------------------------------------- invariants

    /// INV-1: the contract can always pay what it shows.
    function invariant_Solvency() public view {
        (uint256 sumClStored, uint256 sumClaimable,,,) = _sums();
        uint256 bal = usdc.balanceOf(address(mavera));
        assertGe(bal, mavera.accounted(), "INV-1 balance >= accounted");
        assertGe(mavera.accounted(), sumClStored, "INV-1 accounted >= sum stored claimable");
        assertGe(bal, sumClaimable, "INV-1 balance >= sum pending-inclusive claimable");
    }

    /// INV-2: cash identity.
    function invariant_CashIdentity() public view {
        uint256 bal = usdc.balanceOf(address(mavera));
        assertEq(bal, handler.ghost_paid() - handler.ghost_claimed(), "INV-2 paid - claimed");
        assertEq(bal, mavera.accounted() + mavera.pending(), "INV-2 accounted + pending");
    }

    /// INV-3: accounted identity.
    function invariant_AccountedIdentity() public view {
        (,, uint256 sumClaimed,,) = _sums();
        assertEq(mavera.accounted(), mavera.totalDistributed() - sumClaimed, "INV-3 accounted");
        assertEq(sumClaimed, handler.ghost_claimed(), "INV-3 ghost claimed");
    }

    /// INV-4: conservation with dust bounded by the number of holders.
    function invariant_ConservationWithDust() public view {
        (uint256 sumClStored,, uint256 sumClaimed,,) = _sums();
        uint256 dist = mavera.totalDistributed();
        assertGe(dist, sumClaimed + sumClStored, "INV-4 dust >= 0");
        uint256 dust = dist - sumClaimed - sumClStored;
        assertLe(dust, H, "INV-4 dust <= H");
    }

    /// INV-5: dust * M == R + sum of per-holder sub-unit residues.
    function invariant_ExactDust() public view {
        _checkExactDust();
    }

    /// INV-6: entitlement conservation.
    function invariant_EntitlementConservation() public view {
        _checkEntitlementConservation();
    }

    /// INV-7: per-holder sanity, and claimable() never reverts for any actor.
    function invariant_PerHolderSanity() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            int256 e = _entitlement(actors[i]);
            assertGe(e, 0, "INV-7 entitlement >= 0");
            assertGe(SafeCast.toUint256(e) / M, mavera.claimed(actors[i]), "INV-7 allocated >= claimed");
            assertGe(mavera.claimable(actors[i]), _clStored(actors[i]), "INV-7 pending-inclusive >= stored");
        }
        assertEq(mavera.claimable(address(0)), 0);
        assertEq(mavera.claimable(address(mavera)), 0);
        assertEq(mavera.claimable(address(handler)), 0);
    }

    /// INV-8: supply bounds and the zero / self addresses.
    function invariant_SupplyAndZeroAddress() public view {
        uint256 supply = mavera.totalSupply();
        assertGe(supply, CREATOR_SHARES, "INV-8 supply >= creatorShares");
        assertLe(supply, MAX_SUPPLY, "INV-8 supply <= maxSupply");
        uint256 sumBal;
        for (uint256 i = 0; i < actors.length; i++) {
            sumBal += mavera.balanceOf(actors[i]);
        }
        assertEq(sumBal, supply, "INV-8 sum balances");
        assertEq(mavera.balanceOf(address(0)), 0, "INV-8 zero balance");
        assertEq(mavera.corrections(address(0)), 0, "INV-8 zero correction");
        assertEq(mavera.balanceOf(address(mavera)), 0, "INV-8 self balance");
    }

    /// INV-9: monotonicity (the handler asserts per step; here the latest values match the ghosts).
    function invariant_Monotonicity() public view {
        assertGe(mavera.accPerShare(), handler.ghost_accPrev(), "INV-9 accPerShare");
        assertGe(mavera.totalDistributed(), handler.ghost_distPrev(), "INV-9 totalDistributed");
        for (uint256 i = 0; i < actors.length; i++) {
            assertGe(mavera.claimed(actors[i]), handler.ghost_claimedPrev(actors[i]), "INV-9 claimed");
        }
    }

    /// INV-10 / proceeds: every unit that left a buyer reached the creator, never the contract.
    function invariant_BuyProceedsNeverPool() public view {
        assertEq(mavera.totalDistributed(), handler.ghost_paid() - mavera.pending(), "paid == distributed + pending");
        assertGe(usdc.totalSupply(), handler.ghost_paid() + handler.ghost_proceeds(), "mock supply covers all flows");
    }

    function afterInvariant() external view {
        _checkExactDust();
        _checkEntitlementConservation();
    }

    function _checkExactDust() internal view {
        (uint256 sumClStored,, uint256 sumClaimed,, uint256 sumRho) = _sums();
        uint256 dust = mavera.totalDistributed() - sumClaimed - sumClStored;
        assertEq(dust * M, handler.ghost_R() + sumRho, "INV-5 dust * M == R + sum rho");
    }

    function _checkEntitlementConservation() internal view {
        (,,, int256 sumE,) = _sums();
        int256 sumC;
        for (uint256 i = 0; i < actors.length; i++) {
            sumC += mavera.corrections(actors[i]);
        }
        int256 expected = SafeCast.toInt256(M * mavera.totalDistributed()) - SafeCast.toInt256(handler.ghost_R());
        assertEq(sumE, expected, "INV-6 sum E == M * D - R");
        assertEq(sumE, SafeCast.toInt256(mavera.accPerShare() * mavera.totalSupply()) + sumC, "INV-6 A * TS + sum c");
        assertLe(sumC, 0, "INV-6 sum corrections <= 0");
    }
}
