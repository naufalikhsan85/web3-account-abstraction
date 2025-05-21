// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGasManager {
    function isFree() external view returns (bool);
    function defaultFee() external view returns (uint256);
    function baseFee() external view returns (uint256);
    function setIsFree(bool _isFree) external;
    function setDefaultFee(uint256 _fee) external;
    function setBaseFee(uint256 _fee) external;
    function withdraw(uint256 amount, address to) external;
    function balance() external view returns (uint256);
    function transferOwnership(address newOwner) external;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner, uint256 timestamp);
    event GasFeeWithdrawn(address indexed to, uint256 amount, uint256 timestamp);
    event IsFreeUpdated(bool newValue, uint256 timestamp);
    event DefaultFeeUpdated(uint256 newFee, uint256 timestamp);
    event BaseFeeUpdated(uint256 newFee, uint256 timestamp);
}
