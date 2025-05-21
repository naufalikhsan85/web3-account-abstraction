// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "./IWallet.sol";
import "../GasManager/IGasManager.sol";

contract Wallet is 
    Initializable, 
    IERC721Receiver, 
    IERC1155Receiver, 
    IWallet, 
    PausableUpgradeable,
    UUPSUpgradeable 
{
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _owners;
    uint256 public nonce;
    IERC20 public gasToken;
    address public gasManager;
    address public entryPoint;

    string public version;
    address public lastUpgradedTo;

    event Executed(address indexed target, uint256 value, bytes data, uint256 timestamp);
    event GasPaid(address indexed relayer, uint256 amount, uint256 timestamp);
    event OwnerAdded(address indexed newOwner, uint256 timestamp);
    event OwnerRemoved(address indexed removedOwner, uint256 timestamp);
    event Paused(address indexed by, uint256 timestamp);
    event Unpaused(address indexed by, uint256 timestamp);
    event WalletUpgraded(address indexed by, address newImplementation, string version);
    event VersionChanged(string oldVersion, string newVersion, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address[] memory _initialOwners,
        address _gasToken,
        address _gasManager,
        address _entryPoint,
        string memory _version
    ) public initializer {
        require(_initialOwners.length > 0, "At least one owner required");
        require(_entryPoint != address(0), "Invalid entryPoint");

        __Pausable_init();
        __UUPSUpgradeable_init();

        for (uint256 i = 0; i < _initialOwners.length; i++) {
            require(_initialOwners[i] != address(0), "Invalid owner address");
            _owners.add(_initialOwners[i]);
        }

        gasToken = IERC20(_gasToken);
        gasManager = _gasManager;
        entryPoint = _entryPoint;
        version = _version;
    }

    modifier onlyOwnerOrSelf() {
        require(_owners.contains(msg.sender) || msg.sender == address(this), "Not owner or wallet");
        _;
    }

    modifier onlySelf() {
        require(msg.sender == address(this), "Only wallet can execute");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Only EntryPoint allowed");
        _;
    }

    // ========== Owner Management ==========
    function addOwner(address newOwner) external override onlyOwnerOrSelf whenNotPaused {
        require(newOwner != address(0), "Invalid address");
        require(!_owners.contains(newOwner), "Already an owner");

        _owners.add(newOwner);
        emit OwnerAdded(newOwner, block.timestamp);
    }

    function removeOwner(address ownerToRemove) external override onlyOwnerOrSelf whenNotPaused {
        require(_owners.contains(ownerToRemove), "Not an owner");

        _owners.remove(ownerToRemove);
        emit OwnerRemoved(ownerToRemove, block.timestamp);
    }

    function isOwnerOfWallet(address addr) external view override returns (bool) {
        return _owners.contains(addr);
    }

    function getOwners() external view override returns (address[] memory) {
        uint256 ownerCount = _owners.length();
        address[] memory ownersList = new address[](ownerCount);
        for (uint256 i = 0; i < ownerCount; i++) {
            ownersList[i] = _owners.at(i);
        }
        return ownersList;
    }

    // ========== Pausable Admin ==========
    function setPause() public onlyOwnerOrSelf {
        if (paused() == false) {
            _pause();
            emit Paused(msg.sender, block.timestamp);
        } else {
            _unpause();
            emit Unpaused(msg.sender, block.timestamp);
        }
    }

    // ========== EntryPoint Execution ==========
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 userNonce,
        bytes calldata signature
    ) external override onlyEntryPoint whenNotPaused {
        require(userNonce == nonce, "Invalid nonce");

        bytes32 hash = keccak256(
            abi.encodePacked(address(this), target, value, data, userNonce)
        ).toEthSignedMessageHash();

        address recovered = hash.recover(signature);
        require(_owners.contains(recovered), "Invalid signature");

        nonce++;
        uint256 gasStart = gasleft();

        (bool success, ) = target.call{value: value}(data);
        require(success, "Call failed");

        emit Executed(target, value, data, block.timestamp);

        uint256 gasFee = 0;

        if (!IGasManager(gasManager).isFree()) {
            uint256 baseFee = IGasManager(gasManager).baseFee();
            uint256 defaultFee = IGasManager(gasManager).defaultFee();

            if (defaultFee > 0) {
                gasFee = baseFee + defaultFee;
            } else {
                uint256 gasUsed = gasStart - gasleft();
                gasFee = baseFee + gasUsed * tx.gasprice;
            }

            require(gasToken.transfer(gasManager, gasFee), "Gas payment failed");
        }

        emit GasPaid(gasManager, gasFee, block.timestamp);
    }

    // ========== Wallet-Only Operations ==========
    function sendEther(address to, uint256 amount) external override onlyOwnerOrSelf {
        payable(to).transfer(amount);
    }

    function transferERC20(address token, address to, uint256 amount) external override onlyOwnerOrSelf {
        IERC20(token).transfer(to, amount);
    }

    function transferERC721(address nft, uint256 tokenId, address to) external override onlyOwnerOrSelf {
        IERC721(nft).safeTransferFrom(address(this), to, tokenId);
    }

    function transferERC1155(address nft, uint256 tokenId, uint256 amount, address to, bytes calldata data) external override onlyOwnerOrSelf {
        IERC1155(nft).safeTransferFrom(address(this), to, tokenId, amount, data);
    }

    // ========== Fallbacks and Receivers ==========
    receive() external payable override {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override(IERC721Receiver, IWallet) returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override(IERC1155Receiver, IWallet) returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override(IERC1155Receiver, IWallet) returns (bytes4) {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        pure
        override(IERC165, IWallet)
        returns (bool)
    {
        return
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId;
    }

    // ========== Upgrade Control ==========
    function setVersion(string calldata newVersion) external onlyOwnerOrSelf {
        string memory oldVersion = version;
        version = newVersion;
        emit VersionChanged(oldVersion, newVersion, block.timestamp);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwnerOrSelf {
        lastUpgradedTo = newImplementation;
        emit WalletUpgraded(msg.sender, newImplementation, version);
    }
}
