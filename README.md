# VERITY · Academic Registry

Verity issues university certificates as ERC-721 NFTs. University wallets mint, import or revoke credentials through MetaMask. Anyone can verify a token, its owner and its current academic status using just the issuing network and token ID.

This independent Devoir 2 project reuses the Verity workflows and visual identity from [Devoir 1](https://github.com/ayoubsacha/Academic-Certification-System-on-Blockchain). The frontend reads Ethereum directly through wagmi and Viem. The registry is the source of truth for ownership, credentials and permissions. See [architecture](docs/architecture.md), [assignment checklist](docs/compliance.md) and the [French audit report](audit/Rapport_Audit_Smart_Contract.md).

## Run locally

Use an even-numbered Node.js release supported by Hardhat 3, at least Node 22.13. Run these commands from the project root.

```bash
npm --prefix contracts ci
npm --prefix frontend ci
```

Keep the RPC node running, deploy from a second terminal, then start Vite.

```bash
npm --prefix contracts run node
npm --prefix contracts run deploy:local
npm --prefix frontend run dev
```

Visit [the local web app](http://localhost:5173). Hardhat Local defaults to chain ID `31337`, RPC `http://127.0.0.1:8545` and currency ETH. Deployment exports the ABI and writes `frontend/src/config/deployment.local.json` with the contract address, block, transaction and administrator. The app can build with either deployment file absent and displays a configuration message on that network. Redeploy and restart the frontend after resetting the local node.

If port 8545 is occupied, pass `-- --port 18545` to the node command and set `LOCAL_RPC_URL=http://127.0.0.1:18545` for the contract commands and `VITE_LOCAL_RPC_URL=http://127.0.0.1:18545` for Vite. Copy each package's `.env.example` to `contracts/.env` or `frontend/.env.local` to persist local overrides. Use the same RPC URL in MetaMask.

### Connect MetaMask and demonstrate the flow

1. Add the Hardhat Local network in MetaMask. Import account #0 from the local Hardhat terminal into a dedicated development wallet profile. Hardhat development keys are public and suitable only for this local chain. Set `LOCAL_INITIAL_ADMIN` before deployment to designate a different initial administrator.
2. Open **Administrator portal** and connect. The initial administrator has **Administrator** and **Minter** roles. Use a second local account as the recipient. The administrator signs the transaction and the recipient owns the NFT.
3. Open **Issue certificate**, enter fictional details, review the record and approve the wallet transaction. The confirmation includes the token ID, transaction hash and a network-specific public verification link. To seed a record from the CLI, run `npm --prefix contracts run mint:local`.
4. Open public verification without a wallet. Select Hardhat Local, enter the token ID and expand **Token URI and metadata** to inspect the raw data URI and decoded JSON.
5. In **Manage certificates**, find the same token and confirm revocation with an administrator. A new public lookup shows **Revoked** and the same NFT owner. The original record and revocation date remain readable.
6. In **Administration**, grant or remove minting for a second wallet. A minter can issue and import certificates. The administrator role controls revocation and role management.

## Certificate data and behavior

| Field | Representation |
| --- | --- |
| Token ID | Sequential `uint256` starting at 1. The same ID indexes the academic record. |
| Student name and diploma | Nonblank UTF-8 text, up to 120 and 160 bytes respectively. ASCII control characters are rejected. |
| Student ID | 1–80 uppercase ASCII letters, digits, periods, underscores or hyphens. The first character is a letter or digit. React trims and uppercases ASCII input. Solidity enforces the canonical format directly. |
| Issue date | Unix seconds, greater than zero and at or before the block timestamp. The frontend converts the selected calendar date to UTC midnight. |
| Grade | Integer hundredths from 0 to 2000. The app displays `1650` as `16.50 / 20`. |
| Recipient | Required non-zero Ethereum address. `ownerOf(tokenId)` returns the NFT owner. A contract recipient must implement the ERC-721 receiver interface. |
| Revocation | Boolean marker and Unix revocation timestamp. The token and record persist. |

Each ID can receive one credential for the lifetime of this registry, including after revocation. A second diploma or correction under the same student ID requires a different issuance policy. The contract uses OpenZeppelin's ERC-721 and advertises ERC-165 and the ERC-721 metadata interface. It blocks transfers and approvals through the ERC-721 write paths. Wallets can read ownership and metadata, while marketplace operations that require transfers fail.

`tokenURI(tokenId)` returns Base64-encoded UTF-8 JSON generated from current state. It contains the token number, diploma, issue timestamp, grade and Valid or Revoked status. The metadata omits student names and IDs. The record and issuance event remain public, so use only fictional data for demonstrations and Sepolia. External NFT clients may cache an earlier status.

## Spreadsheet import

Download [the fictional sample workbook](frontend/public/sample-certificates.xlsx) in **Bulk import**. Replace the sample wallet addresses with your own test recipients when running on Sepolia. The app accepts XLSX, XLS or CSV, using the first sheet and a header row with the six columns below.

| Column | Example |
| --- | --- |
| `studentName` | Maya Atlas |
| `studentId` | DEMO-001, stored as text to retain leading zeros |
| `diplomaTitle` | Licence informatique |
| `issueDate` | 2024-06-15 or an Excel date cell |
| `grade` | 16.50 |
| `recipientAddress` | A non-zero Ethereum wallet address |

The importer validates up to 500 rows and 2 MB, flags all repetitions of a canonical student ID and checks valid rows against the selected registry. Review the rows and select which records to issue. `VITE_BATCH_SIZE` defaults to 10 and accepts 1–16. The contract takes one array of structured inputs, which keeps each recipient and all academic fields together. It generates URIs on read. Every batch is atomic and needs its own MetaMask confirmation. A failed, rejected or unconfirmed batch stops the queue and earlier confirmed receipts and token IDs stay visible. Download the CSV validation report for per-row errors and confirmed token IDs.

## Security checks

```bash
npm --prefix contracts test
npm --prefix contracts run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Contract checks cover authorization, final-administrator protection, ERC-721 ownership and metadata, revocation, duplicate rejection, invalid inputs, non-transferability, bounded batch gas, atomic rollback and read-only observations during a receiver callback. Minting stores and reserves state before the callback. The OpenZeppelin reentrancy guard covers single mint, batch mint and revocation. The [audit](audit/Rapport_Audit_Smart_Contract.md) records the exact test results and coverage limits.

For browser verification, run the local node and deployment, build or serve the app, and then run the commands below. The suite uses an injected test wallet and real local transactions. Signing in the actual MetaMask extension is a manual check.

```bash
cd frontend
npx playwright install chromium
npm run test:browser
```

The browser test expects batch size 10. Set `VERITY_TEST_URL` for a nondefault app port, `VERITY_TEST_RPC_URL` for a nondefault local RPC and `VERITY_EVIDENCE_DIR` to save screenshots. See [local verification](docs/local-verification.md) for the executed run.

## Sepolia

After deployment is approved, copy `contracts/.env.example` to `contracts/.env`. Set `SEPOLIA_RPC_URL`, `SEPOLIA_DEPLOYER_PRIVATE_KEY` and `SEPOLIA_INITIAL_ADMIN`. Use a dedicated funded Sepolia signer. The deployment signer pays gas. Its address may differ from the explicit initial administrator. For the CLI mint, the configured signer must hold `MINTER_ROLE` and `DEMO_RECIPIENT` must be a non-zero test recipient address.

```bash
npm --prefix contracts run deploy:sepolia
npm --prefix contracts run mint:sepolia
```

The deployment writes `deployment.sepolia.json` independently of the Hardhat Local manifest. Include the public Sepolia manifest, printed contract address, deployment hash, demo mint hash and token ID in the submission. The mint can also be approved in MetaMask through the Sepolia portal with a funded minter. Set `VITE_SEPOLIA_RPC_URL` if using a custom browser-accessible RPC. Frontend environment variables are public. Rebuild or restart Vite after deploying, then select Sepolia in the public lookup or switch MetaMask to chain ID `11155111` for administration. Browser verification links include the network and token ID.

Sepolia deployment and sample transaction are pending approval. GitHub publication is a separate manual action.
