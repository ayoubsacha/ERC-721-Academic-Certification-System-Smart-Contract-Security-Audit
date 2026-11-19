# Devoir 2 requirements

The course handout defines the deliverables and the security checklist. The project brief selects ERC-721, dynamic metadata, non-transferable certificates and deployment on Sepolia after approval.

| Requirement | Implementation and verification |
| --- | --- |
| Independent project based on the Devoir 1 workflows | Separate Git workspace. React preserves the Verity brand, public lookup, issuer portal, bulk import, record management and administration. The [architecture comparison](architecture.md#evolution-from-devoir-1) documents the changes. |
| OpenZeppelin ERC-721 on Solidity ≥ 0.8 | [CertificateRegistry.sol](../contracts/contracts/CertificateRegistry.sol) inherits ERC721 and uses Solidity 0.8.34. Contract tests verify ERC-165, ERC-721 and metadata interface IDs. |
| One unique token ID per certificate | The registry starts at ID 1 and uses that ID for NFT ownership and the academic record. Single and batch tests assert IDs, ownership and balances. |
| Metadata through `tokenURI` | Base64 JSON from live state. Tests verify escaping, Unicode, grade formatting and the status change at revocation. |
| `MINTER_ROLE` and authorized issuance | `AccessControlEnumerable` grants both roles to the explicit initial administrator. Tests exercise denied, granted and removed permissions. |
| Single issuance, batch issuance and certificate reads | `mintCertificate`, `batchMintCertificates` and `getCertificate`. Structured inputs keep fields and recipients together. Solidity and browser tests cover these flows. |
| Revocation restricted to the administrator | `revokeCertificate` enforces `DEFAULT_ADMIN_ROLE`, validates existence and blocks a repeated revocation. The flag and timestamp are retained with NFT ownership. |
| Indexed mint and revoke events | `CertificateMinted` and `CertificateRevoked` index the token ID. Tests decode mint, ERC-721 `Transfer` and revocation logs. |
| Reentrancy protection on mint paths | Both mint functions hold OpenZeppelin's guard and reserve the record before the receiver call. Tests observe the active lock and coherent state during normal callbacks and confirm rollback when a recipient cannot receive. Active nested-write receiver scenarios are outside the executed coverage. |
| Input validation and non-zero recipients | Solidity checks canonical IDs, text length and UTF-8, issue time, grade and recipient. The portal and importer surface corresponding validation errors. |
| Student ID cannot be issued twice | The canonical ID mapping is permanent. Tests cover duplicate IDs across transactions, inside a batch, after revocation and with a different diploma. Browser tests cover case-normalized file duplicates and on-chain duplicates. |
| Automated unit and security tests | [Contract suite](../contracts/test/CertificateRegistry.test.ts) exercises success, access denial, batches, revocation, duplicate mint, event correctness, transfer restrictions, role protection, rollback and gas limits. |
| Adapt React UI and handle role errors | Public details show token ID, address from `ownerOf`, token URI and decoded JSON. Administration reads on-chain roles and uses distinct permission messages. The browser test covers role grants and revokes, lookups and transaction receipts. |
| Complete source and updated README | [README](../README.md) includes local and Sepolia configuration, MetaMask, test commands, import format and limitations. |
| Audit scope, checklist, risk results, test evidence and recommendations | [French audit](../audit/Rapport_Audit_Smart_Contract.md) and its PDF. |
| Sepolia contract address and example transaction | Deployment and demo mint commands are implemented. Public address and transaction evidence are pending authorization, RPC configuration and funding. |
| Optional extensions | ERC-1155, IPFS, QR verification and Foundry fuzzing are outside this submission's scope. |
