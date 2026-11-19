# Local verification

The isolated Hardhat run used chain ID `31337` at `http://127.0.0.1:18545`. The production Vite preview ran at `http://127.0.0.1:14173`. These transaction receipts are from the disposable local chain.

| Evidence | Observed value |
| --- | --- |
| Contract address | `0x5fbdb2315678afecb367f032d93f642f64180aa3` |
| Deployment transaction | `0xb289169ae2eb16067bac81beece8d6a43b2fcf33754ff812135eae9a80aebe46` |
| Deployment block | `1` |
| Fictional demo mint transaction | `0x017ed706b5c826f467b18a9563b734aa873771948d1d92be804a5697bdddce0b` |
| Demo token and owner | `1`, owned by `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

| Command | Outcome |
| --- | --- |
| `npm --prefix contracts run deploy:local` | Confirmed deployment and both initial administrator roles |
| `npm --prefix contracts run mint:local` | Confirmed demo mint and checked `ownerOf` |
| `npm --prefix contracts test` | 30 passed, 0 failed |
| `npm --prefix contracts run typecheck` | Passed |
| `npm --prefix frontend run lint` | Passed |
| `npm --prefix frontend run build` | Passed, with a Vite dependency warning that `node:worker_threads` is externalized for the browser |
| `npm --prefix frontend run test:browser` | 10 scenarios passed against the production preview |

Playwright used a local injected wallet and real transactions. The run covered access denial, wallet chain switching, single issuance, public valid and missing lookup, revocation and updated metadata, role grants and removal, XLSX import and duplicate detection, XLS date cells, CSV import with a failed second batch, and mobile layout. The browser suite used a fresh set of fictional records, including certificate #2 displayed below.

- [Confirmed browser mint](screenshots/successful-mint.png)
- [Wallet-free token verification](screenshots/public-desktop.png)
- [Revoked token and updated metadata](screenshots/revoked-token.png)
- [Confirmed first batch and rejected second batch](screenshots/bulk-results.png)
- [Public mobile layout](screenshots/public-mobile.png)

Actual MetaMask extension signing remains a manual verification step. Sepolia deployment and its example receipt are pending approval.
