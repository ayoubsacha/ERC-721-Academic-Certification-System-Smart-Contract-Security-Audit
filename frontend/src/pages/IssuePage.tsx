import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, FilePlus2, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Feedback, PageHeading } from "../components/AdminUi";
import { describeError, useRegistryActions } from "../services/registry";
import { emptyDraft, formatGrade, formatIssueDate, validateCertificateDraft } from "../utils/certificates";
import type { CertificateDraft, CertificateInput } from "../types/certificate";

const fields: { name: keyof CertificateDraft; label: string; placeholder?: string; wide?: boolean }[] = [
  { name: "studentName", label: "Student full name", placeholder: "e.g. Amina Bennani" },
  { name: "studentId", label: "Student ID", placeholder: "e.g. UNI-2026-001" },
  { name: "diplomaTitle", label: "Diploma title", placeholder: "e.g. Bachelor of Computer Science", wide: true },
  { name: "issueDate", label: "Issue date" },
  { name: "grade", label: "Final grade / 20", placeholder: "e.g. 16.50" },
  { name: "recipientAddress", label: "Recipient wallet address", placeholder: "0x…", wide: true },
];

export function IssuePage() {
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<CertificateInput>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<{ hash: string; ids: bigint[]; network: string }>();
  const actions = useRegistryActions();

  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFailure("");
    setResult(undefined);
    const validation = validateCertificateDraft(draft);
    setErrors(validation.errors);
    if (!validation.data) return;
    setBusy(true);
    try {
      if (await actions.isStudentIdIssued(validation.data.studentId)) {
        setErrors({ studentId: "This student ID has already been issued." });
      } else {
        setReview(validation.data);
      }
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!review || busy) return;
    setBusy(true);
    try {
      setResult(await actions.mintCertificate(review));
      setDraft(emptyDraft());
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setReview(undefined);
      setBusy(false);
    }
  }

  return <>
    <PageHeading label="CERTIFICATE ISSUANCE" title="Issue a certificate" description="Create a new academic credential in the registry." />
    <div className="form-layout">
      <form className="panel issue-panel" onSubmit={event => void prepare(event)} noValidate>
        <div className="panel-heading"><h2><FilePlus2 size={20} /> Certificate details</h2></div>
        {result && <Feedback><strong>Certificate #{result.ids[0]?.toString()} issued</strong><p className="transaction-hash">{result.hash}</p><Link to={`/?network=${result.network}&id=${result.ids[0]}`}>Verify token <ArrowRight size={14} /></Link></Feedback>}
        {failure && <Feedback error>{failure}</Feedback>}
        <div className="form-grid">
          {fields.map(({ name, label, placeholder, wide }) => <div className={wide ? "field wide" : "field"} key={name}>
            <label htmlFor={name}>{label}</label>
            <input id={name} type={name === "issueDate" ? "date" : "text"} inputMode={name === "grade" ? "decimal" : undefined}
              placeholder={placeholder} value={draft[name]} required disabled={busy} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${name}-error` : undefined}
              onChange={event => setDraft(previous => ({ ...previous, [name]: event.target.value }))} />
            {errors[name] && <p id={`${name}-error`} className="field-error">{errors[name]}</p>}
          </div>)}
        </div>
        <div className="form-footer"><button className="button button-primary" type="submit" disabled={busy}>{busy && !review ? "Checking student ID…" : "Review certificate"} <ArrowRight size={16} /></button></div>
      </form>
      <aside className="panel note-panel"><Info size={21} /><h2>Before you issue</h2><p>Use fictional student information. The name, ID, diploma and grade will be publicly readable on this chain.</p><p>The recipient owns the NFT. Each student ID can be used once, even after revocation.</p></aside>
    </div>
    {review && <ConfirmDialog title="Issue this certificate?" confirmLabel="Confirm issuance" busy={busy} onConfirm={() => void issue()} onCancel={() => setReview(undefined)}>
      <p><strong>{review.studentName}</strong> · {review.studentId}</p><p>{review.diplomaTitle} · {formatGrade(review.grade)} / 20</p><p>{formatIssueDate(review.issueDate)}</p><p className="mono break-text">{review.recipient}</p>
    </ConfirmDialog>}
  </>;
}

