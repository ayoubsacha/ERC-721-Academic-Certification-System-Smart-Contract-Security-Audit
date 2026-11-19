// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {CertificateRegistry} from "../CertificateRegistry.sol";

contract ObservableRegistry is CertificateRegistry {
    constructor(address administrator) CertificateRegistry(administrator) {}

    function mintLockEntered() external view returns (bool) {
        return _reentrancyGuardEntered();
    }
}

/// @dev Reads registry state during a normal ERC-721 receiver callback.
contract ObservingReceiver is IERC721Receiver {
    bool public observed;

    function onERC721Received(address, address from, uint256 tokenId, bytes calldata)
        external returns (bytes4)
    {
        ObservableRegistry registry = ObservableRegistry(msg.sender);
        CertificateRegistry.Certificate memory certificate = registry.getCertificate(tokenId);
        require(from == address(0) && registry.ownerOf(tokenId) == address(this), "Ownership is not initialized");
        require(certificate.recipient == address(this) && !certificate.revoked, "Record is not initialized");
        require(registry.isStudentIdIssued(certificate.studentId), "Student ID not reserved");
        require(registry.totalCertificates() == tokenId && registry.mintLockEntered(), "Mint state is not protected");
        observed = true;
        return IERC721Receiver.onERC721Received.selector;
    }
}
