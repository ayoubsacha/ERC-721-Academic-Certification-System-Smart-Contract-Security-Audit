# Architecture

## System

```mermaid
flowchart LR
    Visitor[Public visitor] --> Verify[Public verification]
    Staff[University staff] --> Portal[Verity administrator portal]
    Portal --> Wallet[MetaMask signer]
    Verify --> Read[Viem public RPC client]
    Portal --> Read
    Wallet --> RPC[Ethereum RPC]
    Read --> RPC
    RPC --> Registry[OpenZeppelin ERC-721 certificate registry]
    Registry --> Records[Ownership, credentials, roles and events]
```

React, wagmi and TanStack Query render chain state. Viem uses a separate deployment manifest for each chain and MetaMask signs writes. Hardhat Local runs the development environment. Sepolia is the public test target.

## Wallet authorization

```mermaid
flowchart LR
    User[Connect MetaMask] --> Match{Deployed chain matches wallet?}
    Match -->|No| Switch[Offer configured networks]
    Match -->|Yes| Roles[Read both hasRole values]
    Roles -->|MINTER_ROLE| Issue[Issue and import]
    Roles -->|DEFAULT_ADMIN_ROLE| Admin[Revoke and manage minters]
    Roles -->|Neither| Denied[Show access denied]
    Issue --> Guard[Solidity independently enforces the role]
    Admin --> Guard
```

The constructor grants both roles to an explicit address. `AccessControlEnumerable` supplies the authoritative minter list. Role removal and renunciation both protect the final administrator seat. The UI allows the administrator to grant and remove only the minter role.

## Single mint

```mermaid
sequenceDiagram
    actor A as Minter
    participant V as Verity
    participant W as MetaMask
    participant C as Registry
    A->>V: Enter and review certificate
    V->>C: Check uniqueness and simulate
    V->>W: Request signature on selected chain
    W->>C: mintCertificate(input)
    C->>C: Check role and inputs, reserve ID and record
    C->>C: Safe mint to the recipient
    C-->>V: Confirmed receipt with CertificateMinted
    V-->>A: Token ID, transaction hash and verification link
```

## Bulk mint

```mermaid
flowchart TD
    File[XLSX, XLS or CSV] --> Validate[Parse, validate and check IDs on chain]
    Validate --> Review[Preview and select valid rows]
    Review --> Chunk[Split into configured batch sizes]
    Chunk --> Send[Simulate and approve current batch]
    Send --> Confirm{Receipt confirmed?}
    Confirm -->|Yes| Record[Record transaction and token IDs]
    Record -->|More rows selected| Send
    Confirm -->|No| Stop[Stop queue and retain earlier receipts]
```

An array of `CertificateInput` structs replaces the handout's illustrative address and URI arrays. Each struct binds the academic fields to its recipient. Single and batch minting share validation, reservation and safe minting logic. The entire batch reverts if any input or receiver fails.

## Public verification

```mermaid
sequenceDiagram
    actor Visitor
    participant UI as Verity
    participant RPC as Selected chain RPC
    Visitor->>UI: Select network and enter token ID
    UI->>RPC: Read getCertificate at a fixed block
    RPC-->>UI: Academic record and revocation flag
    UI->>RPC: Read ownerOf and tokenURI at the same block
    RPC-->>UI: Owner and metadata URI
    UI-->>Visitor: Valid, Revoked, Not found or RPC error
```

Links encode the network and ID. The contract encodes JSON as a data URI and derives the status from the same revocation flag exposed by `getCertificate`.

## Revocation

```mermaid
flowchart LR
    Review[Administrator reviews token] --> Wallet[Confirm in MetaMask]
    Wallet --> Auth[Check DEFAULT_ADMIN_ROLE and token]
    Auth --> State[Set revoked and revokedAt]
    State --> Event[Emit CertificateRevoked with token ID]
    State --> Lookup[Public lookup and metadata show Revoked]
    State --> Ownership[Original NFT and owner persist]
```

## Evolution from Devoir 1

| Dimension | Devoir 1 | Devoir 2 |
| --- | --- | --- |
| Token identity | Custom certificate ID | Sequential ID shared by the academic record and ERC-721 NFT |
| Recipient | Optional address | Required NFT owner |
| Authorization | Owner and administrator allowlist | Enumerable administrator and minter roles |
| Uniqueness | Student ID and diploma pair, reusable after revocation | Canonical student ID reserved permanently |
| Revocation | Persistent record with revoked flag | Persistent token, ownership, revoked flag and revocation timestamp |
| Metadata | Custom registry read | Dynamic ERC-721 JSON data URI |
| Network | Local Hardhat | Independent Hardhat Local and Sepolia deployment configuration |
| Batch API | Parallel arrays | One array of validated certificate structs |
