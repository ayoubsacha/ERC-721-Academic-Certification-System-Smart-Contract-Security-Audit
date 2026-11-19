import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Inbox } from "lucide-react";

export function PageHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return <header className="page-heading"><p className="eyebrow">{label}</p><h1>{title}</h1><p>{description}</p></header>;
}

export function Feedback({ error, children }: { error?: boolean; children: ReactNode }) {
  const Icon = error ? CircleAlert : CheckCircle2;
  return <div className={`feedback ${error ? "feedback-error" : "feedback-success"}`} role={error ? "alert" : "status"}><Icon size={19} /><div>{children}</div></div>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span><Inbox size={22} /></span><strong>{title}</strong><p>{children}</p></div>;
}

