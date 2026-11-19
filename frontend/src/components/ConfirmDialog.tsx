import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  busy = false,
  tone = "primary",
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  tone?: "primary" | "danger";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
      <dialog ref={dialog} className="confirm-dialog" aria-labelledby="dialog-title" onCancel={event => {
        event.preventDefault();
        if (!busy) onCancel();
      }}>
        <button className="dialog-close icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="Close dialog">
          <X size={18} />
        </button>
        <div className={`dialog-symbol ${tone === "danger" ? "danger-symbol" : ""}`}>
          <AlertTriangle size={21} />
        </div>
        <p className="eyebrow">PLEASE REVIEW</p>
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-copy">{children}</div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`button ${tone === "danger" ? "button-danger" : "button-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner spinner-small" /> : null}
            {busy ? "Waiting for confirmation…" : confirmLabel}
          </button>
        </div>
      </dialog>
  );
}
