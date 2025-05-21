// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IWallet {
    // ===== Owner Management =====
    function addOwner(address newOwner) external;
    function removeOwner(address ownerToRemove) external;
    function isOwnerOfWallet(address addr) external view returns (bool);
    function getOwners() external view returns (address[] memory);

    // ===== Wallet Operations =====
    function sendEther(address to, uint256 amount) external;
    function transferERC20(address token, address to, uint256 amount) external;
    function transferERC721(address nft, uint256 tokenId, address to) external;
    function transferERC1155(address nft, uint256 tokenId, uint256 amount, address to, bytes calldata data) external;

    // ===== EntryPoint Execution =====
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        uint256 userNonce,
        bytes calldata signature
    ) external;

    // ===== Fallback receiver =====
    receive() external payable;

    // ===== Interface Support =====
    function supportsInterface(bytes4 interfaceId) external view returns (bool);

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4);

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4);

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4);
    
    //initializer
    function initialize(
        address[] memory _initialOwners,
        address _gasToken,
        address _gasManager,
        address _entryPoint,
        string memory _version
    ) external;
}
