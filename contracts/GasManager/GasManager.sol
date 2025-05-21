// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IGasManager.sol";

contract GasManager is IGasManager, ReentrancyGuard {
    address public owner;
    IERC20 public gasToken;

    bool public isFree;
    uint256 public baseFee;
    uint256 public defaultFee;

    constructor(address _owner, address _gasToken) {
        require(_owner != address(0), "Owner cannot be zero address");
        require(_gasToken != address(0), "Token cannot be zero address");

        owner = _owner;
        gasToken = IERC20(_gasToken);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setIsFree(bool _isFree) external override onlyOwner {
        isFree = _isFree;
        emit IsFreeUpdated(_isFree, block.timestamp);
    }

    function setDefaultFee(uint256 _fee) external override onlyOwner {
        require(_fee >= 0, "Fee cannot be negative");
        defaultFee = _fee;
        emit DefaultFeeUpdated(_fee, block.timestamp);
    }

    function setBaseFee(uint256 _fee) external override onlyOwner {
        require(_fee >= 0, "Fee cannot be negative");
        baseFee = _fee;
        emit BaseFeeUpdated(_fee, block.timestamp);
    }

    // Menarik gas fee dari kontrak
    function withdraw(uint256 amount, address to) external override onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        uint256 balanceBefore = gasToken.balanceOf(address(this));
        require(balanceBefore >= amount, "Insufficient funds");

        // Transfer gas fee dengan aman
        bool success = gasToken.transfer(to, amount);
        require(success, "Withdraw failed");

        uint256 balanceAfter = gasToken.balanceOf(address(this));
        uint256 actualTransferred = balanceBefore - balanceAfter;

        emit GasFeeWithdrawn(to, actualTransferred,  block.timestamp);
    }

    // Melihat saldo gas token di kontrak
    function balance() external override view returns (uint256) {
        return gasToken.balanceOf(address(this));
    }

    // Transfer kepemilikan ke pemilik baru
    function transferOwnership(address newOwner) external override onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        emit OwnershipTransferred(owner, newOwner, block.timestamp);
        owner = newOwner;
    }
}
