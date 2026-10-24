// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { StdStorage, stdStorage } from "forge-std/StdStorage.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Mavera } from "../src/Mavera.sol";
import { MockUSDC, ReentrantUSDC } from "./MockUSDC.sol";

/// @notice Unit and fuzz tests for Mavera (docs/05-TEST-PLAN.md). Fixture F: sharePrice 10_000, maxSupply 1_000e18,
/// creatorShares 60e18, buyer funded with 1 USDC and approved. "60/40" = buyer bought 40e18 (cost 400_000 units).
contract MaveraTest is Test {
    using stdStorage for StdStorage;

    uint256 internal constant M = 1e36;
    uint256 internal constant SHARE_PRICE = 10_000;
    uint256 internal constant MAX_SUPPLY = 1000e18;
    uint256 internal constant CREATOR_SHARES = 60e18;
    string internal constant NAME = "Mavera Shares: MON/USD Price API";
    string internal constant SYMBOL = "mPRICE";
    string internal constant ENDPOINT = "/api/price";

    MockUSDC internal usdc;
    Mavera internal mavera;
    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");
    address internal third = makeAddr("third");
    address internal spender = makeAddr("spender");

    function setUp() public {
        usdc = new MockUSDC();
        mavera = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES);
        usdc.mint(buyer, 1_000_000);
        vm.prank(buyer);
        usdc.approve(address(mavera), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _deploy(MockUSDC token, address creator_, uint256 price, uint256 cap, uint256 creatorShares)
        internal
        returns (Mavera)
    {
        return new Mavera(IERC20(address(token)), creator_, price, cap, creatorShares, NAME, SYMBOL, ENDPOINT);
    }

    function _pay(uint256 amount) internal {
        usdc.mint(address(mavera), amount);
    }

    function _buy(address who, uint256 shares) internal {
        vm.prank(who);
        mavera.buy(shares);
    }

    function _sixtyForty() internal {
        _buy(buyer, 40e18);
    }

    /// @dev Entitlement E(h) = accPerShare * balance + correction (magnified).
    function _entitlement(Mavera m, address h) internal view returns (int256) {
        return SafeCast.toInt256(m.accPerShare() * m.balanceOf(h)) + m.corrections(h);
    }

    /// @dev Stored-basis claimable (what claim() pays after its own sync when pending() == 0).
    function _clStored(Mavera m, address h) internal view returns (uint256) {
        return SafeCast.toUint256(_entitlement(m, h)) / M - m.claimed(h);
    }

    function _dust(Mavera m, address[] memory holders) internal view returns (uint256) {
        uint256 sumClaimed;
        uint256 sumCl;
        for (uint256 i = 0; i < holders.length; i++) {
            sumClaimed += m.claimed(holders[i]);
            sumCl += _clStored(m, holders[i]);
        }
        return m.totalDistributed() - sumClaimed - sumCl;
    }

    function _holders3() internal view returns (address[] memory h) {
        h = new address[](3);
        h[0] = creator;
        h[1] = buyer;
        h[2] = third;
    }

    // ------------------------------------------------------------ constructor

    function test_Constructor_MintsCreatorShares() public view {
        assertEq(mavera.balanceOf(creator), CREATOR_SHARES);
        assertEq(mavera.totalSupply(), CREATOR_SHARES);
        assertEq(mavera.accPerShare(), 0);
        assertEq(mavera.corrections(creator), 0);
        assertEq(mavera.accounted(), 0);
        assertEq(mavera.totalDistributed(), 0);
        assertEq(mavera.pending(), 0);
        assertEq(mavera.claimable(creator), 0);
        assertEq(address(mavera.usdc()), address(usdc));
        assertEq(mavera.creator(), creator);
        assertEq(mavera.sharePrice(), SHARE_PRICE);
        assertEq(mavera.maxSupply(), MAX_SUPPLY);
        assertEq(mavera.decimals(), 18);
        assertEq(mavera.name(), NAME);
        assertEq(mavera.symbol(), SYMBOL);
    }

    function test_Constructor_RevertsOnBadParams() public {
        vm.expectRevert(Mavera.InvalidCreatorShares.selector);
        _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, 0);

        vm.expectRevert(Mavera.InvalidCreatorShares.selector);
        _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, MAX_SUPPLY + 1);

        vm.expectRevert(Mavera.InvalidCreator.selector);
        _deploy(usdc, address(0), SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES);

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(Mavera.InvalidCreator.selector);
        _deploy(usdc, predicted, SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES);

        vm.expectRevert(Mavera.InvalidSharePrice.selector);
        _deploy(usdc, creator, 0, MAX_SUPPLY, CREATOR_SHARES);
    }

    function test_Constructor_SucceedsWithPrefundedAddress() public {
        bytes32 salt = keccak256("prefunded");
        bytes memory initCode = abi.encodePacked(
            type(Mavera).creationCode,
            abi.encode(IERC20(address(usdc)), creator, SHARE_PRICE, MAX_SUPPLY, uint256(1e18), NAME, SYMBOL, ENDPOINT)
        );
        address predicted = vm.computeCreate2Address(salt, keccak256(initCode), address(this));
        usdc.mint(predicted, 10_000);
        Mavera m = new Mavera{ salt: salt }(
            IERC20(address(usdc)), creator, SHARE_PRICE, MAX_SUPPLY, 1e18, NAME, SYMBOL, ENDPOINT
        );
        assertEq(address(m), predicted);
        assertEq(m.pending(), 10_000);
        assertEq(m.claimable(creator), 10_000, "pending-inclusive before sync");
        m.sync();
        assertEq(m.pending(), 0);
        assertEq(m.claimable(creator), 10_000);
        assertEq(m.totalDistributed(), 10_000);
    }

    function test_RouteLock_Views() public view {
        assertEq(mavera.payTo(), address(mavera));
        assertEq(mavera.endpoint(), ENDPOINT);
    }

    // -------------------------------------------------------------------- buy

    function test_Buy_PullsCostToCreatorAndMints() public {
        vm.expectEmit(address(mavera));
        emit Mavera.Bought(buyer, 40e18, 400_000);
        _sixtyForty();
        assertEq(usdc.balanceOf(creator), 400_000);
        assertEq(usdc.balanceOf(buyer), 600_000);
        assertEq(mavera.balanceOf(buyer), 40e18);
        assertEq(mavera.totalSupply(), 100e18);
        assertEq(usdc.balanceOf(address(mavera)), 0, "capital never enters the contract");
        assertEq(mavera.pending(), 0);
        assertEq(mavera.corrections(buyer), 0, "mint at accPerShare 0 needs no correction");
    }

    function test_Buy_CostRoundsUp() public {
        uint256 before = usdc.balanceOf(creator);
        _buy(buyer, 99_999_999_999_999);
        assertEq(usdc.balanceOf(creator) - before, 1, "floor would be 0");
        before = usdc.balanceOf(creator);
        _buy(buyer, 1e14);
        assertEq(usdc.balanceOf(creator) - before, 1);
        before = usdc.balanceOf(creator);
        _buy(buyer, 2e14 - 1);
        assertEq(usdc.balanceOf(creator) - before, 2);
    }

    function test_Buy_ZeroSharesReverts() public {
        vm.expectRevert(Mavera.ZeroShares.selector);
        _buy(buyer, 0);
    }

    function test_Buy_ExactlyMaxSupply() public {
        usdc.mint(buyer, 9_400_000);
        _buy(buyer, 940e18);
        assertEq(mavera.totalSupply(), MAX_SUPPLY);
        assertEq(usdc.balanceOf(creator), 9_400_000);
    }

    function test_Buy_OverMaxSupplyReverts() public {
        usdc.mint(buyer, 9_400_000);
        _buy(buyer, 940e18);
        vm.expectRevert(abi.encodeWithSelector(Mavera.SupplyCap.selector, 1, 0));
        _buy(buyer, 1);

        Mavera fresh = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES);
        vm.expectRevert(abi.encodeWithSelector(Mavera.SupplyCap.selector, 940e18 + 1, 940e18));
        vm.prank(buyer);
        fresh.buy(940e18 + 1);
    }

    function test_Buy_SyncsFirst_NoPastRevenueForNewBuyer() public {
        _pay(12_000); // 12_000 * 1e36 is divisible by 60e18, so the creator's share is exact
        assertEq(mavera.pending(), 12_000);
        vm.expectEmit(address(mavera));
        emit Mavera.Synced(12_000);
        _sixtyForty();
        assertEq(mavera.pending(), 0);
        assertEq(mavera.claimable(buyer), 0, "buyer earns nothing from revenue that arrived before the buy");
        assertEq(mavera.claimable(creator), 12_000);
        assertEq(mavera.totalDistributed(), 12_000);
        assertEq(mavera.corrections(buyer), -SafeCast.toInt256(mavera.accPerShare() * 40e18));
    }

    function test_Buy_ReentrantTokenCannotExceedMaxSupply() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        Mavera m = _deploy(MockUSDC(address(evil)), creator, SHARE_PRICE, 100e18, CREATOR_SHARES);
        uint256 room = m.maxSupply() - m.totalSupply();
        evil.mint(buyer, 1_000_000);
        vm.prank(buyer);
        evil.approve(address(m), type(uint256).max);
        evil.setReentry(address(m), abi.encodeCall(Mavera.buy, (room)));

        vm.prank(buyer);
        m.buy(room);

        assertTrue(evil.reentered(), "mock re-entered");
        assertFalse(evil.innerSucceeded(), "inner buy must revert");
        assertEq(
            evil.innerRevertData(),
            abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(m.totalSupply(), m.maxSupply());
        assertEq(m.balanceOf(buyer), room);
    }

    // ------------------------------------------------------------------- sync

    function test_Sync_DistributesProRata() public {
        _sixtyForty();
        _pay(10_000);
        vm.expectEmit(address(mavera));
        emit Mavera.Synced(10_000);
        mavera.sync();
        assertEq(mavera.claimable(creator), 6000);
        assertEq(mavera.claimable(buyer), 4000);
        assertEq(mavera.accounted(), 10_000);
        assertEq(mavera.totalDistributed(), 10_000);
        assertEq(mavera.accPerShare(), 1e20);
        assertEq(mavera.pending(), 0);
    }

    function test_Sync_NoopWhenNothingPending() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();

        uint256 acc = mavera.accPerShare();
        uint256 accounted = mavera.accounted();
        uint256 dist = mavera.totalDistributed();
        vm.recordLogs();
        vm.startStateDiffRecording();
        mavera.sync();
        Vm.AccountAccess[] memory accesses = vm.stopAndReturnStateDiff();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 0, "no event on a no-op sync");
        assertEq(mavera.accPerShare(), acc);
        assertEq(mavera.accounted(), accounted);
        assertEq(mavera.totalDistributed(), dist);
        for (uint256 i = 0; i < accesses.length; i++) {
            for (uint256 j = 0; j < accesses[i].storageAccesses.length; j++) {
                assertFalse(accesses[i].storageAccesses[j].isWrite, "no storage write on a no-op sync");
            }
        }
    }

    function test_Sync_NoopOnFreshContract() public {
        vm.recordLogs();
        mavera.sync();
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(mavera.accPerShare(), 0);
    }

    function test_Sync_AccumulatesAcrossSyncs() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        assertEq(mavera.accPerShare(), 1e20);
        _pay(20_000);
        mavera.sync();
        assertEq(mavera.accPerShare(), 3e20, "cumulative, not reset");
        assertEq(mavera.claimable(creator), 18_000);
        assertEq(mavera.claimable(buyer), 12_000);
        assertEq(mavera.totalDistributed(), 30_000);
    }

    function test_Sync_RemainderStaysInContract() public {
        Mavera m = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, 3e18);
        usdc.mint(address(m), 10);
        m.sync();
        assertEq(m.accPerShare(), 3_333_333_333_333_333_333);
        assertEq(m.claimable(creator), 9);
        address[] memory h = new address[](1);
        h[0] = creator;
        assertEq(_dust(m, h), 1, "one unit of recoverable dust");
        assertEq(m.accounted(), 10);
        assertEq(usdc.balanceOf(address(m)), 10);
    }

    function test_Sync_DustBoundedByHoldersAndRecoverable() public {
        Mavera m = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, 1e18);
        address[] memory h = new address[](4);
        h[0] = creator;
        h[1] = makeAddr("h1");
        h[2] = makeAddr("h2");
        h[3] = makeAddr("h3");
        for (uint256 i = 1; i < 4; i++) {
            vm.prank(creator);
            m.transfer(h[i], 0.25e18);
        }
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(address(m), 1);
            m.sync();
        }
        assertEq(m.accPerShare(), 3e18);
        for (uint256 i = 0; i < 4; i++) {
            assertEq(_entitlement(m, h[i]), 7.5e35);
            assertEq(m.claimable(h[i]), 0);
        }
        assertEq(m.totalDistributed(), 3);
        assertEq(_dust(m, h), 3, "dust 3 <= H = 4; the handoff bound '< 2' would fail");

        usdc.mint(address(m), 1);
        m.sync();
        for (uint256 i = 0; i < 4; i++) {
            assertEq(m.claimable(h[i]), 1);
        }
        assertEq(_dust(m, h), 0, "dust is recovered");
    }

    function test_Overflow_LifetimeRevenueBoundHolds() public {
        Mavera m = _deploy(usdc, creator, SHARE_PRICE, 1e24, 1e18);
        usdc.mint(address(m), 1e15);
        m.sync();
        assertEq(m.accPerShare(), 1e33);
        uint256 shares = 1e24 - 1e18;
        uint256 cost = Math.mulDiv(shares, SHARE_PRICE, 1e18, Math.Rounding.Ceil);
        usdc.mint(buyer, cost);
        vm.startPrank(buyer);
        usdc.approve(address(m), cost);
        m.buy(shares);
        m.transfer(third, shares);
        vm.stopPrank();
        assertEq(m.balanceOf(third), shares);
        assertEq(m.corrections(third), -SafeCast.toInt256(1e33 * shares), "1e57 < 2^255 fits");
        assertEq(m.claimable(third), 0);
        assertEq(m.claimable(buyer), 0);
        assertEq(m.claimable(creator), 1e15);
    }

    function test_Update_RevertsOnSafeCastOverflow() public {
        _sixtyForty();
        stdstore.target(address(mavera)).sig("accPerShare()").checked_write(uint256(1) << 255);
        assertEq(mavera.accPerShare(), uint256(1) << 255);
        vm.expectRevert(abi.encodeWithSelector(SafeCast.SafeCastOverflowedUintToInt.selector, uint256(1) << 255));
        vm.prank(buyer);
        mavera.transfer(third, 1);
    }

    // ------------------------------------------------------------------ claim

    function test_Claimable_IncludesPending() public {
        _sixtyForty();
        _pay(10_000);
        assertEq(mavera.accPerShare(), 0, "not synced yet");
        assertEq(mavera.claimable(creator), 6000);
        assertEq(mavera.claimable(buyer), 4000);
        vm.prank(creator);
        mavera.claim();
        assertEq(usdc.balanceOf(creator) - 400_000, 6000, "claim pays exactly the shown number");
    }

    function test_Claim_PaysExactlyClaimable() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        vm.expectEmit(address(mavera));
        emit Mavera.Claimed(creator, 6000);
        vm.prank(creator);
        mavera.claim();
        assertEq(usdc.balanceOf(creator), 400_000 + 6000);
        assertEq(mavera.claimable(creator), 0);
        assertEq(mavera.claimed(creator), 6000);
        assertEq(mavera.accounted(), 4000);
        assertEq(mavera.totalDistributed(), 10_000);
        assertEq(mavera.pending(), 0);
        assertEq(usdc.balanceOf(address(mavera)), 4000);
    }

    function test_Claim_SyncsFirst() public {
        _sixtyForty();
        _pay(10_000);
        vm.expectEmit(address(mavera));
        emit Mavera.Synced(10_000);
        vm.prank(buyer);
        mavera.claim();
        assertEq(usdc.balanceOf(buyer), 600_000 + 4000);
    }

    function test_Claim_NothingReverts() public {
        vm.expectRevert(Mavera.NothingToClaim.selector);
        vm.prank(third);
        mavera.claim();

        _sixtyForty();
        _pay(10_000);
        vm.prank(creator);
        mavera.claim();
        vm.expectRevert(Mavera.NothingToClaim.selector);
        vm.prank(creator);
        mavera.claim();
    }

    function test_Claim_AfterSellingAllShares_KeepsPastRevenue() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        _pay(20_000);
        mavera.sync();
        assertEq(mavera.claimable(buyer), 12_000);

        vm.prank(buyer);
        mavera.transfer(third, 40e18);
        _pay(5000);
        mavera.sync();

        assertEq(mavera.balanceOf(buyer), 0);
        assertEq(mavera.claimable(buyer), 12_000, "frozen entitlement");
        assertEq(mavera.claimable(third), 2000);
        assertEq(mavera.claimable(creator), 21_000);
        vm.prank(buyer);
        mavera.claim();
        assertEq(usdc.balanceOf(buyer), 600_000 + 12_000);
    }

    // --------------------------------------------------------------- transfer

    function test_Transfer_PreservesClaimables() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        _pay(20_000);
        mavera.sync();
        assertEq(mavera.accPerShare(), 3e20);

        vm.prank(buyer);
        mavera.transfer(third, 20e18);
        assertEq(mavera.claimable(buyer), 12_000);
        assertEq(mavera.claimable(third), 0);
        assertEq(mavera.claimable(creator), 18_000);
        assertEq(mavera.corrections(buyer), 6e39);
        assertEq(mavera.corrections(third), -6e39);
    }

    function test_Transfer_ToSelf_NoChange() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        vm.prank(buyer);
        mavera.transfer(third, 10e18);
        int256 c = mavera.corrections(third);
        uint256 cl = mavera.claimable(third);
        vm.prank(third);
        mavera.transfer(third, 5e18);
        assertEq(mavera.corrections(third), c);
        assertEq(mavera.claimable(third), cl);
        assertEq(mavera.balanceOf(third), 10e18);
    }

    function test_TransferFrom_ByApprovedSpender() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        _pay(20_000);
        mavera.sync();
        vm.prank(buyer);
        mavera.approve(spender, 20e18);
        vm.prank(spender);
        mavera.transferFrom(buyer, third, 20e18);
        assertEq(mavera.corrections(buyer), 6e39);
        assertEq(mavera.corrections(third), -6e39);
        assertEq(mavera.corrections(spender), 0);
        assertEq(mavera.claimable(buyer), 12_000);
        assertEq(mavera.claimable(third), 0);
    }

    function test_Transfer_ToContractReverts() public {
        vm.expectRevert(Mavera.InvalidRecipient.selector);
        vm.prank(creator);
        mavera.transfer(address(mavera), 1);

        vm.prank(creator);
        mavera.approve(spender, 1);
        vm.expectRevert(Mavera.InvalidRecipient.selector);
        vm.prank(spender);
        mavera.transferFrom(creator, address(mavera), 1);
        assertEq(mavera.balanceOf(address(mavera)), 0);
    }

    function test_Transfer_BeforeSync_Attribution() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        _pay(20_000);
        assertEq(mavera.pending(), 20_000);

        vm.expectEmit(address(mavera));
        emit Mavera.Synced(20_000);
        vm.prank(buyer);
        mavera.transfer(third, 20e18);
        assertEq(mavera.pending(), 0, "the transfer synced first");
        mavera.sync();

        assertEq(mavera.claimable(creator), 18_000);
        assertEq(mavera.claimable(buyer), 12_000, "holder of record when the payment landed");
        assertEq(mavera.claimable(third), 0, "held nothing when the payment landed");
    }

    function test_Reentrancy_ClaimWithCallbackToken() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        Mavera m = _deploy(MockUSDC(address(evil)), creator, SHARE_PRICE, MAX_SUPPLY, CREATOR_SHARES);
        evil.mint(address(m), 12_000); // exact for 60e18 shares
        evil.setReentry(address(m), abi.encodeCall(Mavera.claim, ()));

        vm.prank(creator);
        m.claim();

        assertTrue(evil.reentered());
        assertFalse(evil.innerSucceeded(), "inner claim must revert");
        assertEq(
            evil.innerRevertData(),
            abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(evil.balanceOf(creator), 12_000, "paid exactly once");
        assertEq(m.claimed(creator), 12_000);
        assertEq(m.accounted(), 0);
        assertEq(m.claimable(creator), 0);
    }

    function test_DirectUsdcTransferCountsAsRevenue() public {
        _sixtyForty();
        address donor = makeAddr("donor");
        usdc.mint(donor, 25_000);
        vm.prank(donor);
        usdc.transfer(address(mavera), 25_000);
        assertEq(mavera.pending(), 25_000);
        assertEq(mavera.claimable(creator), 15_000);
        assertEq(mavera.claimable(buyer), 10_000);
        mavera.sync();
        assertEq(mavera.totalDistributed(), 25_000);
        assertEq(mavera.claimable(creator), 15_000);
        assertEq(mavera.claimable(buyer), 10_000);
    }

    // ------------------------------------------------------- worked example

    /// @dev docs/02-CONTRACT-SPEC.md section 8, every row with exact integers.
    function test_WorkedExample_Section8() public {
        address[] memory h = _holders3();
        // step 0
        assertEq(mavera.balanceOf(creator), 60e18);
        // step 1: buy 40
        _sixtyForty();
        assertEq(usdc.balanceOf(creator), 400_000);
        assertEq(mavera.totalSupply(), 100e18);
        // step 2: payment #1
        _pay(10_000);
        assertEq(mavera.claimable(creator), 6000);
        assertEq(mavera.claimable(buyer), 4000);
        // step 3: sync #1
        mavera.sync();
        assertEq(mavera.accPerShare(), 100_000_000_000_000_000_000);
        assertEq(mavera.accounted(), 10_000);
        assertEq(mavera.totalDistributed(), 10_000);
        assertEq(mavera.claimable(creator), 6000);
        assertEq(mavera.claimable(buyer), 4000);
        assertEq(_dust(mavera, h), 0);
        // step 4 and 5: payment #2 and sync #2
        _pay(20_000);
        assertEq(usdc.balanceOf(address(mavera)), 30_000);
        mavera.sync();
        assertEq(mavera.accPerShare(), 300_000_000_000_000_000_000);
        assertEq(mavera.accounted(), 30_000);
        assertEq(mavera.totalDistributed(), 30_000);
        assertEq(mavera.claimable(creator), 18_000);
        assertEq(mavera.claimable(buyer), 12_000);
        // step 6: transfer 20 to third
        vm.prank(buyer);
        mavera.transfer(third, 20e18);
        assertEq(mavera.balanceOf(buyer), 20e18);
        assertEq(mavera.balanceOf(third), 20e18);
        assertEq(mavera.corrections(buyer), 6_000_000_000_000_000_000_000_000_000_000_000_000_000);
        assertEq(mavera.corrections(third), -6_000_000_000_000_000_000_000_000_000_000_000_000_000);
        assertEq(mavera.corrections(creator), 0);
        assertEq(mavera.claimable(creator), 18_000);
        assertEq(mavera.claimable(buyer), 12_000);
        assertEq(mavera.claimable(third), 0);
        assertEq(_dust(mavera, h), 0);
        // step 7 and 8: payment #3 and sync #3
        _pay(5000);
        mavera.sync();
        assertEq(mavera.accPerShare(), 350_000_000_000_000_000_000);
        assertEq(mavera.accounted(), 35_000);
        assertEq(mavera.totalDistributed(), 35_000);
        assertEq(mavera.claimable(creator), 21_000);
        assertEq(mavera.claimable(buyer), 13_000);
        assertEq(mavera.claimable(third), 1000);
        // step 9: buyer claims
        vm.prank(buyer);
        mavera.claim();
        assertEq(usdc.balanceOf(buyer), 600_000 + 13_000);
        assertEq(mavera.claimed(buyer), 13_000);
        assertEq(mavera.claimable(buyer), 0);
        assertEq(mavera.accounted(), 22_000);
        assertEq(mavera.totalDistributed(), 35_000);
        assertEq(usdc.balanceOf(address(mavera)), 22_000);
        assertEq(_entitlement(mavera, creator), 2.1e40);
        assertEq(_entitlement(mavera, buyer), 1.3e40);
        assertEq(_entitlement(mavera, third), 1e39);
        assertEq(_dust(mavera, h), 0);
        // step 10 and 11: 7-unit payment shows dust
        _pay(7);
        assertEq(usdc.balanceOf(address(mavera)), 22_007);
        mavera.sync();
        assertEq(mavera.accPerShare(), 350_070_000_000_000_000_000);
        assertEq(mavera.accounted(), 22_007);
        assertEq(mavera.totalDistributed(), 35_007);
        assertEq(mavera.claimable(creator), 21_004);
        assertEq(mavera.claimable(buyer), 1);
        assertEq(mavera.claimable(third), 1001);
        assertEq(_dust(mavera, h), 1, "7 units cannot split 60/20/20 exactly");
        assertEq(mavera.accounted(), 21_004 + 1 + 1001 + 1, "dust is held inside accounted");
    }

    // -------------------------------------------------------------------- gas

    function test_Gas_TransferWithSyncInUpdate() public {
        _sixtyForty();
        _pay(10_000);
        mavera.sync();
        vm.prank(buyer);
        mavera.transfer(third, 1e18); // warm third
        vm.prank(buyer);
        uint256 g0 = gasleft();
        mavera.transfer(third, 1e18);
        uint256 gasNoPending = g0 - gasleft();

        _pay(10_000);
        vm.prank(buyer);
        g0 = gasleft();
        mavera.transfer(third, 1e18);
        uint256 gasWithPending = g0 - gasleft();

        emit log_named_uint("transfer gas, pending == 0", gasNoPending);
        emit log_named_uint("transfer gas, pending  > 0", gasWithPending);
        assertGt(gasWithPending, gasNoPending);
        assertEq(mavera.claimable(third), 200, "third held 2e18 of 100e18 when the second payment landed");
    }

    // ------------------------------------------------------------------- fuzz

    function testFuzz_SingleHolderGetsEverything(uint96 amount) public {
        amount = uint96(bound(amount, 1, 1e15));
        Mavera m = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, 1e18);
        usdc.mint(address(m), amount);
        assertEq(m.claimable(creator), amount);
        m.sync();
        assertEq(m.claimable(creator), amount, "1e18 divides M, so R == 0");
        assertEq(m.accPerShare(), uint256(amount) * 1e18);
    }

    function testFuzz_TwoHoldersSplit(uint96 amount, uint64 a, uint64 b) public {
        a = uint64(bound(a, 1, 1e19));
        b = uint64(bound(b, 1, 1e19));
        amount = uint96(bound(amount, 1, 1e12));
        Mavera m = _deploy(usdc, creator, SHARE_PRICE, MAX_SUPPLY, a);
        uint256 cost = Math.mulDiv(b, SHARE_PRICE, 1e18, Math.Rounding.Ceil);
        usdc.mint(buyer, cost);
        vm.startPrank(buyer);
        usdc.approve(address(m), cost);
        m.buy(b);
        vm.stopPrank();

        usdc.mint(address(m), amount);
        m.sync();
        uint256 clA = m.claimable(creator);
        uint256 clB = m.claimable(buyer);
        assertLe(clA + clB, amount);
        assertLe(amount - (clA + clB), 2);
        uint256 total = uint256(a) + b;
        assertApproxEqAbs(clA, uint256(amount) * a / total, 1);
        assertApproxEqAbs(clB, uint256(amount) * b / total, 1);
        assertGe(usdc.balanceOf(address(m)), clA + clB);
    }

    function testFuzz_CostCeil(uint128 shares) public {
        shares = uint128(bound(shares, 1, MAX_SUPPLY - mavera.totalSupply()));
        uint256 expected = (uint256(shares) * SHARE_PRICE + 1e18 - 1) / 1e18;
        usdc.mint(buyer, expected);
        uint256 before = usdc.balanceOf(creator);
        vm.expectEmit(address(mavera));
        emit Mavera.Bought(buyer, shares, expected);
        _buy(buyer, shares);
        assertEq(usdc.balanceOf(creator) - before, expected);
        assertGe(expected, 1);
        assertEq(mavera.balanceOf(buyer), shares);
    }

    /// @dev 4 actors, 50 steps; stateless complement of the invariant suite (INV-1 ... INV-9 at the end).
    function testFuzz_RandomSequence(bytes32 seed) public {
        address[] memory actors = new address[](4);
        actors[0] = creator;
        actors[1] = buyer;
        actors[2] = third;
        actors[3] = spender;
        uint256 ghostPaid;
        uint256 ghostClaimed;
        uint256 ghostR;

        for (uint256 i = 0; i < 50; i++) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            uint256 action = r % 5;
            address actor = actors[(r >> 8) % 4];
            if (action == 0) {
                uint256 amount = bound(r >> 16, 1, 1e12);
                _pay(amount);
                ghostPaid += amount;
            } else if (action == 1) {
                uint256 room = MAX_SUPPLY - mavera.totalSupply();
                if (room == 0) continue;
                uint256 shares = bound(r >> 16, 1, room);
                uint256 cost = Math.mulDiv(shares, SHARE_PRICE, 1e18, Math.Rounding.Ceil);
                usdc.mint(actor, cost);
                ghostR += _remainder();
                vm.startPrank(actor);
                usdc.approve(address(mavera), cost);
                mavera.buy(shares);
                vm.stopPrank();
            } else if (action == 2) {
                address to = actors[(r >> 24) % 4];
                uint256 bal = mavera.balanceOf(actor);
                if (bal == 0) continue;
                uint256 amount = bound(r >> 32, 1, bal);
                ghostR += _remainder();
                vm.prank(actor);
                mavera.transfer(to, amount);
            } else if (action == 3) {
                uint256 cl = mavera.claimable(actor);
                if (cl == 0) continue;
                ghostR += _remainder();
                uint256 before = usdc.balanceOf(actor);
                vm.prank(actor);
                mavera.claim();
                assertEq(usdc.balanceOf(actor) - before, cl, "claim pays claimable");
                ghostClaimed += cl;
            } else {
                ghostR += _remainder();
                mavera.sync();
            }
        }
        ghostR += _remainder();
        mavera.sync();
        _assertInvariants(actors, ghostPaid, ghostClaimed, ghostR);
    }

    struct Sums {
        uint256 cl;
        uint256 claimed;
        int256 e;
        int256 c;
        uint256 rho;
        uint256 bal;
    }

    /// @dev INV-1 ... INV-9 over `actors` against the ghost sums of the sequence.
    function _assertInvariants(address[] memory actors, uint256 ghostPaid, uint256 ghostClaimed, uint256 ghostR)
        internal
        view
    {
        Sums memory s;
        for (uint256 i = 0; i < actors.length; i++) {
            int256 e = _entitlement(mavera, actors[i]);
            assertGe(e, 0, "INV-7 entitlement >= 0");
            assertGe(SafeCast.toUint256(e) / M, mavera.claimed(actors[i]), "INV-7 allocated >= claimed");
            s.e += e;
            s.rho += SafeCast.toUint256(e) % M;
            s.c += mavera.corrections(actors[i]);
            s.cl += mavera.claimable(actors[i]);
            s.claimed += mavera.claimed(actors[i]);
            s.bal += mavera.balanceOf(actors[i]);
        }
        uint256 bal = usdc.balanceOf(address(mavera));
        uint256 dist = mavera.totalDistributed();
        assertGe(bal, mavera.accounted(), "INV-1 balance >= accounted");
        assertGe(mavera.accounted(), s.cl, "INV-1 accounted >= sum claimable");
        assertEq(bal, ghostPaid - ghostClaimed, "INV-2 cash identity");
        assertEq(bal, mavera.accounted() + mavera.pending(), "INV-2 accounted + pending");
        assertEq(mavera.accounted(), dist - s.claimed, "INV-3 accounted identity");
        assertEq(s.claimed, ghostClaimed, "INV-3 ghost claimed");
        uint256 dust = dist - s.claimed - s.cl;
        assertLe(dust, actors.length, "INV-4 dust <= holders");
        assertEq(dust * M, ghostR + s.rho, "INV-5 exact dust");
        assertEq(s.e, SafeCast.toInt256(M * dist) - SafeCast.toInt256(ghostR), "INV-6 entitlement conservation");
        assertEq(s.e, SafeCast.toInt256(mavera.accPerShare() * mavera.totalSupply()) + s.c, "INV-6 corrections");
        assertLe(s.c, 0, "INV-6 sum corrections <= 0");
        assertLe(mavera.totalSupply(), MAX_SUPPLY, "INV-8 cap");
        assertGe(mavera.totalSupply(), CREATOR_SHARES, "INV-8 floor");
        assertEq(s.bal, mavera.totalSupply(), "INV-8 balances");
        assertEq(mavera.balanceOf(address(mavera)), 0, "INV-8 no self holdings");
    }

    /// @dev Sync remainder r = (P * M) mod TS that the next effective sync floors away.
    function _remainder() internal view returns (uint256) {
        uint256 p = mavera.pending();
        uint256 supply = mavera.totalSupply();
        if (p == 0 || supply == 0) return 0;
        return mulmod(p, M, supply);
    }
}
