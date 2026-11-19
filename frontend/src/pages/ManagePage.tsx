import { useState } from "react";
import { Search, ShieldOff } from "lucide-react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CertificateDetails } from "../components/CertificateDetails";
import { EmptyState, Feedback, PageHeading } from "../components/AdminUi";
import { useCertificate, useCertificatePage, useCertificateCount } from "../hooks/useRegistryRead";
import { describeError, isMissingCertificate, useRegistryActions } from "../services/registry";
import { parseCertificateId } from "../utils/certificates";
import type { AdminContext } from "../layouts/AdminLayout";

const PAGE_SIZE = 10;

export function ManagePage() {
  const { canAdminister } = useOutletContext<AdminContext>();
  const [params, setParams] = useSearchParams();
  const searchId = params.get("id");
  const id = parseCertificateId(searchId ?? "");
  const [draft, setDraft] = useState(searchId ?? "");
  const [page, setPage] = useState(0);
  const [review, setReview] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const lookup = useCertificate(id);
  const actions = useRegistryActions();
  const count = useCertificateCount();
  const total = count.data ?? 0n;
  const records = useCertificatePage(total, page, PAGE_SIZE);

  async function revoke() {
    if (!review || busy) return;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      const result = await actions.revokeCertificate(review);
      setMessage(`Certificate #${review} revoked. Transaction ${result.hash}`);
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setBusy(false);
      setReview(undefined);
    }
  }

  return <>
    <PageHeading label="CERTIFICATE RECORDS" title="Manage certificates" description={canAdminister ? "Browse issued credentials and revoke a certificate when needed." : "Browse issued credentials and view ownership, metadata and revocation status."} />
    {message && <Feedback><span className="break-text">{message}</span></Feedback>}
    {failure && <Feedback error>{failure}</Feedback>}
    <section className="panel">
      <form className="manage-search" onSubmit={event => {
        event.preventDefault();
        if (!parseCertificateId(draft)) { setFailure("Enter a valid positive certificate ID."); return; }
        setFailure(""); setMessage(""); setParams({ id: draft.trim() }); void lookup.refetchIfCurrent(draft);
      }}>
        <div className="field"><label htmlFor="manage-id">Certificate ID</label><input id="manage-id" inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} placeholder="e.g. 1" /></div>
        <button className="button button-primary" type="submit"><Search size={16} /> Search</button>
        {searchId && <button className="button button-secondary" type="button" onClick={() => { setDraft(""); setParams({}); setFailure(""); setMessage(""); }}>Clear</button>}
      </form>
      {searchId && <div className="lookup-result" aria-live="polite">
        {!id && <Feedback error>Enter a valid positive certificate ID.</Feedback>}
        {id && lookup.isFetching && <p className="inline-loading"><span className="spinner" /> Reading certificate…</p>}
        {id && lookup.error && <Feedback error>{isMissingCertificate(lookup.error) ? "Certificate not found." : describeError(lookup.error)}</Feedback>}
        {id && lookup.data && !lookup.error && <><CertificateDetails certificateId={id} certificate={lookup.data} />
          {canAdminister && !lookup.data.revoked && <div className="form-footer"><button className="button button-danger" type="button" onClick={() => setReview(id)}><ShieldOff size={16} /> Revoke certificate</button></div>}
        </>}
      </div>}
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Issued records</h2><small className="muted">{count.data?.toString() ?? "—"} total</small></div>
      {count.isError && <Feedback error>{describeError(count.error)}</Feedback>}
      {records.isFetching && <p className="panel-state">Loading records…</p>}
      {records.error && <Feedback error>{describeError(records.error)}</Feedback>}
      {records.data?.length ? <div className="table-scroll"><table><thead><tr><th>Token ID</th><th>Student</th><th>Diploma</th><th>Status</th><th>Record</th></tr></thead>
        <tbody>{records.data.map(({ id: recordId, certificate }) => <tr key={recordId.toString()}>
          <td>#{recordId.toString()}</td><td><strong>{certificate.studentName}</strong><small>{certificate.studentId}</small></td><td>{certificate.diplomaTitle}</td>
          <td><span className={`status-pill ${certificate.revoked ? "status-revoked" : "status-valid"}`}>{certificate.revoked ? "Revoked" : "Valid"}</span></td>
          <td><Link to={`?id=${recordId}`} onClick={() => { setDraft(recordId.toString()); setFailure(""); setMessage(""); }}>View #{recordId.toString()}</Link></td>
        </tr>)}</tbody></table></div> : count.data === 0n ? <EmptyState title="No certificates issued">New records will appear here after confirmation.</EmptyState> : null}
      {total > BigInt(PAGE_SIZE) && <div className="form-footer pagination">
        <button type="button" className="button button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span>
        <button type="button" className="button button-secondary" disabled={BigInt((page + 1) * PAGE_SIZE) >= total} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </section>
    {review && <ConfirmDialog title={`Revoke certificate #${review}?`} confirmLabel="Confirm revocation" tone="danger" busy={busy} onConfirm={() => void revoke()} onCancel={() => setReview(undefined)}>
      <p>Public verification will show this certificate as revoked. The original record and its blockchain history will remain publicly readable.</p>
    </ConfirmDialog>}
  </>;
}

