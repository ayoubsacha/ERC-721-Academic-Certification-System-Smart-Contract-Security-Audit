import { useRef, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Feedback, PageHeading } from "../components/AdminUi";
import { BATCH_SIZE } from "../config/blockchain";
import { describeError, useRegistryActions } from "../services/registry";
import type { ImportRow } from "../utils/importCertificates";

type BatchResult = { batch: number; rows: number[]; hash?: string; ids?: bigint[]; error?: string };

export function ImportPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingReview, setPendingReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<BatchResult[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const actions = useRegistryActions();

  const valid = rows.filter(row => !row.errors.length);
  const eligible = valid.filter(row => row.issuedId === undefined);
  const chosen = eligible.filter(row => selected.has(row.rowNumber));
  const expected = Math.ceil(chosen.length / BATCH_SIZE);

  async function load(file?: File) {
    if (!file || loading || sending) return;
    setLoading(true);
    setMessage("");
    setRows([]);
    setSelected(new Set());
    setResults([]);
    setFileName(file.name);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls or .csv file.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Use a file smaller than 2 MB.");
      const { parseCertificateFile } = await import("../utils/importCertificates");
      const parsed = parseCertificateFile(await file.arrayBuffer());
      const checkable = parsed.filter(row => row.data && !row.errors.length);
      for (let index = 0; index < checkable.length; index += 20) {
        await Promise.all(checkable.slice(index, index + 20).map(async row => {
          if (await actions.isStudentIdIssued(row.data!.studentId)) {
            row.errors.push("This student ID has already been issued.");
          }
        }));
      }
      setRows(parsed);
      setSelected(new Set(parsed.filter(row => !row.errors.length).map(row => row.rowNumber)));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function issueSelected() {
    if (sending || !chosen.length) return;
    setPendingReview(false);
    setSending(true);
    setMessage("");
    try {
      for (let index = 0; index < chosen.length; index += BATCH_SIZE) {
        const group = chosen.slice(index, index + BATCH_SIZE);
        const batch = results.length + Math.floor(index / BATCH_SIZE) + 1;
        const rowNumbers = group.map(row => row.rowNumber);
        try {
          const { hash, ids } = await actions.batchMint(group.map(row => row.data!));
          setResults(previous => [...previous, { batch, rows: rowNumbers, hash, ids }]);
          const issued = new Map(group.map((row, offset) => [row.rowNumber, ids[offset]]));
          setRows(previous => previous.map(row => issued.has(row.rowNumber) ? { ...row, issuedId: issued.get(row.rowNumber) } : row));
          setSelected(previous => new Set([...previous].filter(number => !issued.has(number))));
        } catch (error) {
          setResults(previous => [...previous, { batch, rows: rowNumbers, error: describeError(error) }]);
          const remaining = chosen.length - index - group.length;
          setMessage(remaining ? `Issuing stopped. ${remaining} remaining row(s) were not submitted.` : "Issuing stopped before this batch could be confirmed.");
          break;
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function exportReport() {
    try {
      const { downloadValidationReport } = await import("../utils/importCertificates");
      downloadValidationReport(rows);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function toggle(rowNumber: number) {
    setSelected(previous => {
      const copy = new Set(previous);
      if (copy.has(rowNumber)) copy.delete(rowNumber);
      else copy.add(rowNumber);
      return copy;
    });
  }

  return <>
    <PageHeading label="SPREADSHEET IMPORT" title="Bulk import" description={`Review Excel or CSV records before issuing up to ${BATCH_SIZE} certificates per transaction.`} />
    <section className="panel">
      <div className="panel-heading"><h2><FileSpreadsheet size={20} /> Upload a spreadsheet</h2><a href={`${import.meta.env.BASE_URL}sample-certificates.xlsx`} download><Download size={16} /> Sample workbook</a></div>
      <div className={`file-drop ${dragging ? "dragging" : ""}`} onDragOver={event => { event.preventDefault(); if (!sending) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void load(event.dataTransfer.files[0]); }}>
        <UploadCloud size={27} /><strong>{loading ? "Validating records…" : "Drop your spreadsheet here"}</strong><small>.xlsx, .xls or .csv · Up to 500 rows and 2 MB</small>
        <input ref={fileInput} type="file" aria-label="Certificate spreadsheet" accept=".xlsx,.xls,.csv" hidden disabled={loading || sending} onChange={event => void load(event.target.files?.[0])} />
        <button className="button button-secondary" type="button" disabled={loading || sending} onClick={() => fileInput.current?.click()}>Choose file</button>
      </div>
      <p className="upload-help">Use the sample headers. Every row needs a unique student ID, a recipient wallet, a date and a grade from 0 to 20.</p>
    </section>
    {message && <Feedback error>{message}</Feedback>}
    {rows.length > 0 && <section className="panel">
      <div className="panel-heading"><div><h2>Review imported rows</h2><small className="muted">{fileName}</small></div><button type="button" className="button button-secondary" onClick={() => void exportReport()}><Download size={16} /> Validation report</button></div>
      <div className="summary-pills"><span>{rows.length} imported</span><span>{valid.length} valid</span><span>{rows.length - valid.length} invalid</span><span>{chosen.length} selected</span></div>
      <div className="table-scroll"><table>
        <thead><tr><th><input type="checkbox" aria-label="Select all eligible rows" disabled={!eligible.length || sending} checked={eligible.length > 0 && chosen.length === eligible.length} onChange={() => setSelected(chosen.length === eligible.length ? new Set() : new Set(eligible.map(row => row.rowNumber)))} /></th><th>Row</th><th>Student</th><th>Diploma</th><th>Issue date</th><th>Grade</th><th>Recipient</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.rowNumber}>
          <td><input type="checkbox" aria-label={`Select row ${row.rowNumber}`} checked={selected.has(row.rowNumber)} disabled={Boolean(row.errors.length || row.issuedId !== undefined || sending)} onChange={() => toggle(row.rowNumber)} /></td>
          <td>{row.rowNumber}</td><td><strong>{row.draft.studentName || "—"}</strong><small>{row.draft.studentId}</small></td><td>{row.draft.diplomaTitle || "—"}</td><td>{row.draft.issueDate || "—"}</td><td>{row.draft.grade || "—"}</td><td className="mono break-text">{row.draft.recipientAddress || "—"}</td>
          <td>{row.errors.length ? <><span className="status-pill status-revoked">Invalid</span><small>{row.errors.join(" ")}</small></> : <span className="status-pill status-valid">{row.issuedId ? `Issued #${row.issuedId}` : "Ready"}</span>}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="form-footer"><button className="button button-primary" disabled={!chosen.length || sending} onClick={() => setPendingReview(true)}>{sending ? "Waiting for wallet and chain…" : "Review selected certificates"} <ArrowRight size={16} /></button></div>
    </section>}
    {(results.length > 0 || sending) && <section className="panel" aria-live="polite">
      <div className="panel-heading"><h2>Transaction results</h2></div>
      {sending && <p className="inline-loading"><span className="spinner" /> Waiting for the current batch confirmation…</p>}
      {results.map(batch => <Feedback key={batch.batch} error={Boolean(batch.error)}>
        <strong>Batch {batch.batch} · Rows {batch.rows.join(", ")}</strong>
        {batch.error ? <p>{batch.error}</p> : <><p>Confirmed IDs {batch.ids?.map(String).join(", ")}</p><p className="transaction-hash">{batch.hash}</p></>}
      </Feedback>)}
    </section>}
    {pendingReview && <ConfirmDialog title="Issue selected certificates?" confirmLabel="Issue selected" onCancel={() => setPendingReview(false)} onConfirm={() => void issueSelected()}>
      <p>{rows.length} imported · {valid.length} valid · {rows.length - valid.length} invalid</p>
      <p><strong>{chosen.length} selected</strong> across {expected} transaction(s). Your wallet will ask you to approve each transaction separately.</p>
    </ConfirmDialog>}
  </>;
}

