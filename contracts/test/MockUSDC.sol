// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal 6-decimal USDC stand-in with a test-controlled `mint`.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice MockUSDC that re-enters a configured target once on `transfer` / `transferFrom` and records the result.
contract ReentrantUSDC is MockUSDC {
    address public target;
    bytes public payload;
    bool public reentered;
    bool public innerSucceeded;
    bytes public innerRevertData;

    function setReentry(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _reenter();
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _reenter();
        return super.transferFrom(from, to, amount);
    }

    function _reenter() internal {
        if (target == address(0) || reentered) return;
        reentered = true;
        // forge-lint: disable-next-line(unchecked-call)
        (bool ok, bytes memory ret) = target.call(payload); // test double: the result is recorded, not trusted
        innerSucceeded = ok;
        innerRevertData = ret;
    }
}
