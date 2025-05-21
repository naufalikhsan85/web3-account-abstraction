// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../Account/IWallet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract EntryPoint is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private validFactories;

    event Executed(
        address indexed wallet,
        address indexed target,
        uint256 value,
        bytes data,
        uint256 timestamp,
        bool success
    );
    
    event FactoryAdded(address indexed factory, uint256 timestamp);
    event FactoryRemoved(address indexed factory, uint256 timestamp);

    constructor(address _walletFactory) Ownable(msg.sender) {
        require(_walletFactory != address(0), "EntryPoint: Invalid factory address");
        validFactories.add(_walletFactory);  // Menyimpan alamat Wallet Factory
    }

    /// @notice Mengeksekusi transaksi dari wallet yang valid berdasarkan factory
    function executeTransaction(
        address wallet,
        address target,
        uint256 value,
        bytes calldata data,
        uint256 userNonce,
        bytes calldata signature
    ) external {
        require(isValidWallet(wallet), "EntryPoint: Invalid wallet");

        // Memverifikasi transaksi menggunakan IWallet
        IWallet(payable(wallet)).execute(target, value, data, userNonce, signature);

        bool success = true;

        // Eksekusi transaksi
        (success, ) = target.call{value: value}(data);
        require(success, "Transaction execution failed");

        emit Executed(wallet, target, value, data, block.timestamp, success);
    }

    function executeBatchTransaction(
        address wallet,
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata data,
        uint256[] calldata userNonces,
        bytes[] calldata signatures
    ) external {
        require(isValidWallet(wallet), "EntryPoint: Invalid wallet");
        require(targets.length == values.length, "EntryPoint: Mismatch targets/values length");
        require(targets.length == data.length, "EntryPoint: Mismatch targets/data length");
        require(targets.length == userNonces.length, "EntryPoint: Mismatch targets/nonces length");
        require(targets.length == signatures.length, "EntryPoint: Mismatch targets/signatures length");

        bool success;

        for (uint256 i = 0; i < targets.length; i++) {
            // Memverifikasi transaksi menggunakan IWallet
            IWallet(payable(wallet)).execute(targets[i], values[i], data[i], userNonces[i], signatures[i]);

            // Eksekusi transaksi
            (success, ) = targets[i].call{value: values[i]}(data[i]);
            require(success, "Transaction execution failed");

            // Emit event untuk setiap transaksi
            emit Executed(wallet, targets[i], values[i], data[i], block.timestamp, success);
        }

    }
    /// @notice Memverifikasi apakah wallet berasal dari WalletFactory
    function isValidWallet(address wallet) public view returns (bool) {
        // Memeriksa apakah wallet berasal dari WalletFactory
        address creator;
        assembly {
            creator := extcodehash(wallet)
        }
        return validFactories.contains(creator);
    }

    /// @notice Menambahkan factory baru ke dalam daftar factory yang sah
    function addFactory(address factory) external onlyOwner {
        require(factory != address(0), "EntryPoint: Invalid factory address");
        require(!validFactories.contains(factory), "EntryPoint: Factory already added");

        validFactories.add(factory);
        emit FactoryAdded(factory, block.timestamp);
    }

    /// @notice Menghapus factory dari daftar factory yang sah
    function removeFactory(address factory) external onlyOwner {
        require(validFactories.contains(factory), "EntryPoint: Factory not found");

        validFactories.remove(factory);
        emit FactoryRemoved(factory, block.timestamp);
    }

    /// @notice Mendapatkan daftar factory yang sah
    function getFactories() external view returns (address[] memory) {
        uint256 length = validFactories.length();
        address[] memory factories = new address[](length);

        for (uint256 i = 0; i < length; i++) {
            factories[i] = validFactories.at(i);
        }
        return factories;
    }
}
