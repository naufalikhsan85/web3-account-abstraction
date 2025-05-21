// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

abstract contract Admin is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AddAdminLog(address indexed newAdmin);
    event RemoveAdminLog(address indexed removedAdmin);

    EnumerableSet.AddressSet private _admins;

    modifier onlyAdmin() {
        require(_admins.contains(msg.sender), "msg.sender must be admin");
        _;
    }

    constructor(address _init_admin_owner) Ownable(_init_admin_owner) {
        _admins.add(_init_admin_owner);
    }

    function addAdmin(address _address) external onlyOwner {
        if (!_admins.contains(_address)) {
            _admins.add(_address);
            emit AddAdminLog(_address);
        }
    }

    function removeAdmin(address _address) external onlyOwner {
        if (_admins.contains(_address)){
            _admins.remove(_address);
            emit RemoveAdminLog(_address);
        }
    }

    function isAdmin(address _address) public view returns (bool) {
        return _admins.contains(_address);
    }

    function getAdminCount() external view returns (uint256) {
        return _admins.length();
    }

    function getAdminAt(uint256 index) external view returns (address) {
        require(index < _admins.length(), "index out of bounds");
        return _admins.at(index);
    }

    function getAllAdmins() external view returns (address[] memory) {
        return _admins.values();
    }
}
