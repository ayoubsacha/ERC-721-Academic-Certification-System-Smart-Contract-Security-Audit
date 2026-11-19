// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Academic credentials indexed by their non-transferable ERC-721 token IDs.
contract CertificateRegistry is ERC721, AccessControlEnumerable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_BATCH_SIZE = 16;

    struct CertificateInput {
        string studentName;
        string studentId;
        string diplomaTitle;
        uint256 issueDate;
        uint256 grade;
        address recipient;
    }

    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        uint256 issueDate;
        uint256 grade;
        address recipient;
        bool revoked;
        uint256 revokedAt;
    }

    uint256 public totalCertificates;
    mapping(uint256 => Certificate) private _certificates;
    mapping(bytes32 => bool) private _issuedStudentIds;

    error ZeroAddress();
    error InvalidText(string field);
    error InvalidStudentId();
    error InvalidIssueDate();
    error InvalidGrade();
    error InvalidBatchSize();
    error DuplicateStudentId(string studentId);
    error AlreadyRevoked(uint256 tokenId);
    error NonTransferable();
    error LastAdministrator();

    event CertificateMinted(uint256 indexed tokenId, string studentId, address indexed recipient);
    event CertificateRevoked(uint256 indexed tokenId);

    constructor(address initialAdministrator) ERC721("Verity Academic Certificate", "VERITY") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdministrator);
        _grantRole(MINTER_ROLE, initialAdministrator);
    }

    function mintCertificate(CertificateInput calldata input)
        external onlyRole(MINTER_ROLE) nonReentrant returns (uint256)
    {
        return _issue(input);
    }

    function batchMintCertificates(CertificateInput[] calldata inputs)
        external onlyRole(MINTER_ROLE) nonReentrant
    {
        if (inputs.length == 0 || inputs.length > MAX_BATCH_SIZE) revert InvalidBatchSize();
        for (uint256 i = 0; i < inputs.length; ++i) {
            _issue(inputs[i]);
        }
    }

    function getCertificate(uint256 tokenId) external view returns (Certificate memory) {
        _requireOwned(tokenId);
        return _certificates[tokenId];
    }

    function isStudentIdIssued(string calldata studentId) external view returns (bool) {
        _validateStudentId(bytes(studentId));
        return _issuedStudentIds[keccak256(bytes(studentId))];
    }

    function revokeCertificate(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        _requireOwned(tokenId);
        Certificate storage certificate = _certificates[tokenId];
        if (certificate.revoked) revert AlreadyRevoked(tokenId);
        certificate.revoked = true;
        certificate.revokedAt = block.timestamp;
        emit CertificateRevoked(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Certificate storage certificate = _certificates[tokenId];
        string memory id = Strings.toString(tokenId);
        string memory fraction = Strings.toString(certificate.grade % 100);
        string memory grade = string.concat(
            Strings.toString(certificate.grade / 100), ".", bytes(fraction).length == 1 ? "0" : "", fraction
        );
        string memory metadata = string.concat(
            '{"name":"Academic Certificate #', id,
            '","description":"Verity university academic certificate","attributes":[',
            '{"trait_type":"Certificate number","value":"', id,
            '"},{"trait_type":"Diploma","value":"', Strings.escapeJSON(certificate.diplomaTitle),
            '"},{"trait_type":"Issue date (Unix UTC)","value":', Strings.toString(certificate.issueDate),
            '},{"trait_type":"Grade","value":"', grade,
            '"},{"trait_type":"Status","value":"', certificate.revoked ? "Revoked" : "Valid",
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(metadata)));
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControlEnumerable) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function approve(address, uint256) public pure override {
        revert NonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert NonTransferable();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (account == address(0)) revert ZeroAddress();
        return super._grantRole(role, account);
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        if (role == DEFAULT_ADMIN_ROLE && hasRole(role, account) && getRoleMemberCount(role) == 1) {
            revert LastAdministrator();
        }
        return super._revokeRole(role, account);
    }

    function _issue(CertificateInput calldata input) private returns (uint256 tokenId) {
        if (input.recipient == address(0)) revert ZeroAddress();
        if (!_validText(bytes(input.studentName), 120)) revert InvalidText("studentName");
        if (!_validText(bytes(input.diplomaTitle), 160)) revert InvalidText("diplomaTitle");
        _validateStudentId(bytes(input.studentId));
        if (input.issueDate == 0 || input.issueDate > block.timestamp) revert InvalidIssueDate();
        if (input.grade > 2000) revert InvalidGrade();

        bytes32 key = keccak256(bytes(input.studentId));
        if (_issuedStudentIds[key]) revert DuplicateStudentId(input.studentId);
        _issuedStudentIds[key] = true;
        tokenId = ++totalCertificates;
        _certificates[tokenId] = Certificate(
            input.studentName, input.studentId, input.diplomaTitle,
            input.issueDate, input.grade, input.recipient, false, 0
        );

        // Reserve the ID and publish all academic fields before the ERC-721 receiver callback.
        _safeMint(input.recipient, tokenId);
        emit CertificateMinted(tokenId, input.studentId, input.recipient);
    }

    // Canonical on-chain format. Only the browser converts lowercase input for convenience.
    function _validateStudentId(bytes calldata id) private pure {
        if (id.length == 0 || id.length > 80) revert InvalidStudentId();
        for (uint256 i = 0; i < id.length; ++i) {
            bytes1 ch = id[i];
            if ((ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9")) continue;
            if (i == 0 || (ch != "-" && ch != "_" && ch != ".")) revert InvalidStudentId();
        }
    }

    // Solidity strings can contain arbitrary bytes. Accept Unicode scalar values so tokenURI
    // always contains valid UTF-8, while rejecting ASCII controls and blank fields.
    function _validText(bytes calldata value, uint256 maxBytes) private pure returns (bool) {
        if (value.length == 0 || value.length > maxBytes) return false;
        bool hasText;
        for (uint256 i = 0; i < value.length;) {
            uint8 lead = uint8(value[i++]);
            if (lead < 0x20 || lead == 0x7f) return false;
            if (lead < 0x80) {
                if (lead != 0x20) hasText = true;
                continue;
            }
            if (lead < 0xc2 || lead > 0xf4) return false;
            uint256 tails = lead < 0xe0 ? 1 : (lead < 0xf0 ? 2 : 3);
            if (i + tails > value.length) return false;
            uint8 first = uint8(value[i]);
            if ((lead == 0xe0 && first < 0xa0) || (lead == 0xed && first >= 0xa0) ||
                (lead == 0xf0 && first < 0x90) || (lead == 0xf4 && first >= 0x90)) return false;
            for (uint256 j = 0; j < tails; ++j) {
                uint8 tail = uint8(value[i++]);
                if (tail < 0x80 || tail > 0xbf) return false;
            }
            hasText = true;
        }
        return hasText;
    }
}
