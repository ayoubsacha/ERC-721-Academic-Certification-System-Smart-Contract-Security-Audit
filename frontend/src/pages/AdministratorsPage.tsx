import { useState } from "react";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { Address } from "viem";
import { ShieldPlus, UserMinus } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AdminContext } from "../layouts/AdminLayout";
import { useMinterList } from "../hooks/useRegistryRead";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Feedback, PageHeading } from "../components/AdminUi";
import { describeError, useRegistryActions } from "../services/registry";

export function AdministratorsPage() {
  const { address, canAdminister } = useOutletContext<AdminContext>();
  const minters = useMinterList(canAdminister);
  const [wallet, setWallet] = useState("");
  const [review, setReview] = useState<{ kind: "add" | "remove"; account: Address }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState("");
  const actions = useRegistryActions();

  async function changeAccess() {
    if (!review || busy) return;
    setBusy(true); setFailure(""); setResult("");
    try {
      const response = review.kind === "add" ? await actions.grantMinter(review.account) : await actions.revokeMinter(review.account);
      setResult(`Minter access ${review.kind === "add" ? "granted" : "removed"}. Transaction ${response.hash}`);
      if (review.kind === "add") setWallet("");
    } catch (error) { setFailure(describeError(error)); }
    finally { setReview(undefined); setBusy(false); }
  }

  return <>
    <PageHeading label="ROLE MANAGEMENT" title="Administration" description="Manage the wallets allowed to mint certificate NFTs." />
    {result && <Feedback><span className="break-text">{result}</span></Feedback>}
    {failure && <Feedback error>{failure}</Feedback>}
    <form className="panel" onSubmit={event => {
      event.preventDefault();
      const account = wallet.trim();
      if (!isAddress(account) || account.toLowerCase() === zeroAddress) { setFailure("Enter a valid wallet address."); return; }
      setFailure(""); setReview({ kind: "add", account: getAddress(account) });
    }}>
      <div className="panel-heading"><h2>Grant the minter role</h2></div>
      <div className="manage-search"><div className="field"><label htmlFor="new-admin">Wallet address</label><input id="new-admin" placeholder="0x…" value={wallet} onChange={event => setWallet(event.target.value)} /></div>
        <button className="button button-primary" type="submit"><ShieldPlus size={16} /> Add minter</button></div>
    </form>
    <section className="panel"><div className="panel-heading"><h2>Authorized minters</h2></div>
      {minters.isPending && <p className="panel-state">Loading wallets…</p>}
      {minters.isError && <Feedback error>{describeError(minters.error)}</Feedback>}
      {minters.data?.length === 0 && <p className="panel-state">No active minters.</p>}
      {minters.data && <ul className="record-list admin-wallet-list">{minters.data.map(account => {
        const connected = account.toLowerCase() === address.toLowerCase();
        return <li key={account}><div><strong className="mono break-text">{account}</strong>{connected && <small>Connected wallet</small>}</div>
          <button className="button button-secondary" type="button" onClick={() => setReview({ kind: "remove", account })}><UserMinus size={16} /> Remove</button></li>;
      })}</ul>}
    </section>
    {review && <ConfirmDialog title={review.kind === "add" ? "Grant minter access?" : "Remove minter access?"} confirmLabel={review.kind === "add" ? "Grant access" : "Remove access"}
      tone={review.kind === "remove" ? "danger" : "primary"} busy={busy} onCancel={() => setReview(undefined)} onConfirm={() => void changeAccess()}>
      <p className="mono break-text">{review.account}</p><p>{review.kind === "add" ? "This wallet will be able to issue certificates." : "This wallet will lose permission to issue certificates."}</p>
    </ConfirmDialog>}
  </>;
}

