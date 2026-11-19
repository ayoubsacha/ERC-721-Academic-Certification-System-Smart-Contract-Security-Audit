import { ArrowRight, FileCheck2, FilePlus2, Files, ShieldCheck, Wallet } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import { EmptyState, Feedback, PageHeading } from "../components/AdminUi";
import { useCertificateActivity, useCertificateCount } from "../hooks/useRegistryRead";
import { shortAddress } from "../utils/certificates";
import type { AdminContext } from "../layouts/AdminLayout";
import { useRegistry } from "../config/blockchain";

export function DashboardPage() {
  const { address, canAdminister, canMint } = useOutletContext<AdminContext>();
  const registry = useRegistry();
  const count = useCertificateCount();
  const activity = useCertificateActivity();
  return <>
    <PageHeading label="REGISTRY OVERVIEW" title="Certificate dashboard" description="Issue academic credentials and track activity in the university registry." />
    <div className="overview-stats">
      <article className="panel stat-card"><FileCheck2 /><span>Total NFTs issued</span><strong>{count.data?.toString() ?? "—"}</strong></article>
      <article className="panel stat-card"><Wallet /><span>Connected wallet</span><strong className="mono" title={address}>{shortAddress(address)}</strong></article>
      <article className="panel stat-card"><ShieldCheck /><span>Active roles</span><strong>{[canAdminister && "Administrator", canMint && "Minter"].filter(Boolean).join(" · ")}</strong></article>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-heading"><h2>Recent activity</h2><Link to="/admin/manage">View records <ArrowRight size={15} /></Link></div>
        {activity.isPending ? <p className="panel-state">Loading activity…</p> : activity.isError ? <Feedback error>Could not read recent registry events from the RPC.</Feedback> : activity.data?.length ? (
          <ul className="record-list">{activity.data.map(event => <li key={event.key}>
            <span className={`activity-icon ${event.kind}`}><FileCheck2 size={17} /></span>
            <div><strong>Certificate #{event.certificateId.toString()} {event.kind}</strong><small>{event.studentId ?? `Block ${event.blockNumber.toString()}`}</small></div>
            <Link to={`/admin/manage?id=${event.certificateId}`} aria-label={`View certificate ${event.certificateId}`}><ArrowRight size={17} /></Link>
          </li>)}</ul>
        ) : <EmptyState title="No recent activity">No mint or revocation events in the queried blocks.</EmptyState>}
      </section>
      <section className="panel"><div className="panel-heading"><h2>Quick actions</h2></div>
        <div className="quick-actions">
          {canMint && <Link to="/admin/issue"><FilePlus2 size={20} /><span><strong>Issue a certificate</strong><small>Mint one credential NFT</small></span><ArrowRight size={16} /></Link>}
          {canMint && <Link to="/admin/import"><Files size={20} /><span><strong>Import a spreadsheet</strong><small>Review and issue several records</small></span><ArrowRight size={16} /></Link>}
          {canAdminister && <Link to="/admin/administrators"><ShieldCheck size={20} /><span><strong>Manage minters</strong><small>Grant or remove issuance permissions</small></span><ArrowRight size={16} /></Link>}
        </div>
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading"><h2>Registry deployment</h2><small>{registry.chain.name} · {registry.chain.id}</small></div>
      <p className="mono break-text">{registry.address}</p>
    </section>
  </>;
}

