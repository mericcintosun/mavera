// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title Mavera
/// @notice ERC-20 shares in the future revenue of one x402-paid API: every USDC payment lands in this contract
/// (it is the x402 `payTo`), a permissionless `sync()` splits it pro rata among the holders of record, holders
/// pull their share with `claim()`, and a fixed-price `buy()` sells new shares with the proceeds going to the creator.
/// @dev ERC-1726 style "magnified dividend per share plus per-holder correction" accounting with magnifier 1e36.
/// Specification: docs/02-CONTRACT-SPEC.md. Testnet proof of concept with test USDC; not an offer of securities.
contract Mavera is ERC20, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev Magnifier M applied to `accPerShare` and `corrections`.
    uint256 private constant MAGNIFIER = 1e36;

    /// @notice Payout asset (6-decimal USDC); must be the asset the x402 route is priced in.
    IERC20 public immutable usdc;
    /// @notice Receives the creator shares at deployment and the proceeds of every `buy()`.
    address public immutable creator;
    /// @notice USDC atomic units per 1e18 share-wei (fixed primary price).
    uint256 public immutable sharePrice;
    /// @notice Hard cap on `totalSupply()` in share-wei.
    uint256 public immutable maxSupply;

    /// @notice Cumulative USDC units per share-wei, magnified by 1e36.
    uint256 public accPerShare;
    /// @notice USDC units distributed by `sync()` but not yet claimed (held by this contract).
    uint256 public accounted;
    /// @notice Lifetime USDC units that have been synced.
    uint256 public totalDistributed;
    /// @notice Per-holder magnified correction that keeps entitlements constant across mints and transfers.
    mapping(address holder => int256) public corrections;
    /// @notice Per-holder cumulative payouts in USDC units.
    mapping(address holder => uint256) public claimed;
    /// @dev Route-lock pairing string (for example "/api/price"); read only by `endpoint()`.
    string private _endpoint;

    event Synced(uint256 amount);
    event Bought(address indexed buyer, uint256 shares, uint256 cost);
    event Claimed(address indexed holder, uint256 amount);

    error NothingToClaim();
    error ZeroShares();
    error SupplyCap(uint256 requested, uint256 available);
    error ZeroCost();
    error InvalidRecipient();
    error InvalidCreator();
    error InvalidSharePrice();
    error InvalidCreatorShares();

    /// @notice Stores the immutable parameters and mints `creatorShares` to `creator_`, so supply is never zero.
    constructor(
        IERC20 usdc_,
        address creator_,
        uint256 sharePrice_,
        uint256 maxSupply_,
        uint256 creatorShares,
        string memory name_,
        string memory symbol_,
        string memory endpoint_
    ) ERC20(name_, symbol_) {
        if (creator_ == address(0) || creator_ == address(this)) revert InvalidCreator();
        if (sharePrice_ == 0) revert InvalidSharePrice();
        if (creatorShares == 0 || creatorShares > maxSupply_) revert InvalidCreatorShares();
        usdc = usdc_;
        creator = creator_;
        sharePrice = sharePrice_;
        maxSupply = maxSupply_;
        _endpoint = endpoint_;
        _mint(creator_, creatorShares);
    }

    /// @notice Buys `shares` share-wei at `sharePrice`, paying `ceil(shares * sharePrice / 1e18)` USDC to the creator.
    function buy(uint256 shares) external nonReentrant {
        sync();
        if (shares == 0) revert ZeroShares();
        uint256 supply = totalSupply();
        if (supply + shares > maxSupply) revert SupplyCap(shares, maxSupply - supply);
        uint256 cost = Math.mulDiv(shares, sharePrice, 1e18, Math.Rounding.Ceil);
        if (cost == 0) revert ZeroCost();
        _mint(msg.sender, shares);
        // forge-lint: disable-next-line(reentrancy-events)
        emit Bought(msg.sender, shares, cost); // the only prior external call is the trusted USDC `balanceOf` view
        usdc.safeTransferFrom(msg.sender, creator, cost);
    }

    /// @notice Distributes every USDC unit that arrived since the last sync across the current holders; anyone may
    /// call.
    function sync() public {
        uint256 supply = totalSupply();
        if (supply == 0) return;
        uint256 p = pending();
        // slither-disable-next-line incorrect-equality
        if (p == 0) return; // exact: `pending()` is a uint256 floored at zero, so `== 0` is the only no-op test
        accPerShare += p * MAGNIFIER / supply;
        accounted += p;
        totalDistributed += p;
        // forge-lint: disable-next-line(reentrancy-events)
        emit Synced(p); // the only prior external call is the trusted USDC `balanceOf` view in `pending()`
    }

    /// @notice Syncs, then pays the caller exactly `claimable(msg.sender)`; reverts when that is zero.
    function claim() external nonReentrant {
        sync();
        uint256 amount = _claimableAt(accPerShare, msg.sender);
        // slither-disable-next-line incorrect-equality
        if (amount == 0) revert NothingToClaim(); // exact: `_claimableAt` returns a uint256 floored at zero
        claimed[msg.sender] += amount;
        accounted -= amount;
        emit Claimed(msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    /// @notice USDC units `holder` can claim right now, including revenue that has arrived but is not yet synced.
    function claimable(address holder) public view returns (uint256) {
        uint256 acc = accPerShare;
        uint256 supply = totalSupply();
        uint256 p = pending();
        if (supply > 0 && p > 0) acc += p * MAGNIFIER / supply;
        return _claimableAt(acc, holder);
    }

    /// @notice USDC units held by this contract that have not been synced yet (floored at zero).
    function pending() public view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 acc = accounted;
        return balance > acc ? balance - acc : 0;
    }

    /// @notice The x402 `payTo` address: this contract, so every payment becomes holder revenue.
    function payTo() external view returns (address) {
        return address(this);
    }

    /// @notice The paid route this contract is paired with (route lock).
    function endpoint() external view returns (string memory) {
        return _endpoint;
    }

    /// @dev Claimable at magnifier `acc`: floor((acc * balance + correction) / M) - claimed, never negative.
    function _claimableAt(uint256 acc, address holder) private view returns (uint256) {
        int256 entitlement = SafeCast.toInt256(acc * balanceOf(holder)) + corrections[holder];
        if (entitlement <= 0) return 0;
        uint256 allocated = SafeCast.toUint256(entitlement) / MAGNIFIER;
        uint256 paid = claimed[holder];
        return allocated > paid ? allocated - paid : 0;
    }

    /// @dev Every mint and transfer syncs first (pending revenue goes to the holders of record), then moves the
    /// balance and adjusts both corrections so no entitlement changes. Shares can never be sent to this contract.
    function _update(address from, address to, uint256 value) internal override {
        if (to == address(this)) revert InvalidRecipient();
        sync();
        super._update(from, to, value);
        int256 delta = SafeCast.toInt256(accPerShare * value);
        if (from != address(0)) corrections[from] += delta;
        if (to != address(0)) corrections[to] -= delta;
    }
}
