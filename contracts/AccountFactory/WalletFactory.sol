// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import "../Admin/Admin.sol";
import "../Account/IWallet.sol";

contract WalletFactory is Admin, Pausable {
    using Clones for address;

    address public immutable implementation; // Immutable to save gas

    event WalletDeployed(
        address indexed wallet,
        address indexed deployer,
        bytes32 indexed salt,
        uint256 timestamp
    );


    constructor(address _implementation) Admin(msg.sender) {
        require(_implementation != address(0), "Factory: Invalid implementation");
        implementation = _implementation;
    }

    function setPause() public onlyOwner {
        if (paused() == false) {
            _pause();
        } else {
            _unpause();
        }
    }

    /**
     * @dev Deploys a wallet using `cloneDeterministic` and initializes it.
     */
    function _deployWallet(
        address[] calldata owners,
        address gasToken,
        address gasManager,
        address entryPoint,
        bytes32 salt
    ) internal returns (address walletAddr) {
        
        // Ensure that the wallet is not deployed already
        require(getAddressWallet(salt).code.length == 0, "Factory: Wallet already deployed");

        walletAddr = implementation.cloneDeterministic(salt);
        IWallet(payable(walletAddr)).initialize(
            owners,
            gasToken,
            gasManager,
            entryPoint,
            "1"
        );

        emit WalletDeployed(walletAddr, msg.sender, salt, block.timestamp);
    }

    /**
     * @dev Deploy a single wallet with deterministic address.
     */
    function deployWallet(
        address[] calldata owners,
        address gasToken,
        address gasManager,
        address entryPoint,
        bytes32 salt
    ) external whenNotPaused onlyAdmin returns (address walletAddr) {
        walletAddr = _deployWallet(owners, gasToken, gasManager, entryPoint, salt);
    }

    /**
     * @dev Predict address of clone without deploying.
     */
    function getAddressWallet(bytes32 salt) public view returns (address predicted) {
        predicted = implementation.predictDeterministicAddress(salt, address(this));
    }

    /**
     * @dev Deploy multiple wallets in batch with deterministic addresses.
     */
    function deployBatchWallets(
        address[][] calldata ownerLists,
        address gasToken,
        address gasManager,
        address entryPoint,
        bytes32[] calldata salts
    ) external whenNotPaused onlyAdmin returns (address[] memory wallets) {
        require(ownerLists.length == salts.length, "Factory: Length mismatch");
        wallets = new address[](salts.length);

        for (uint256 i = 0; i < salts.length; i++) {
            wallets[i] = _deployWallet(
                ownerLists[i],
                gasToken,
                gasManager,
                entryPoint,
                salts[i]
            );
        }
    }

}
