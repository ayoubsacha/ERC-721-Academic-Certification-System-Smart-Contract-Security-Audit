import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileSearch,
  Fingerprint,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { CertificateDetails } from "../components/CertificateDetails";
import { useCertificate } from "../hooks/useRegistryRead";
import { networks, useRegistry } from "../config/blockchain";
import { parseCertificateId } from "../utils/certificates";
import { describeError, isMissingCertificate } from "../services/registry";

const currentYear = new Date().getFullYear();

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("id") ?? "");
  const { deployed, network, chain } = useRegistry();
  const certificateId = parseCertificateId(params.get("id") ?? "");
  const [inputError, setInputError] = useState("");
  const lookup = useCertificate(certificateId);
  const certificate = lookup.data;

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const id = parseCertificateId(trimmed);
    if (!id) {
      setParams({ network });
      setInputError("Enter a token ID greater than zero.");
      return;
    }
    if (!deployed) {
      setInputError(`The registry on ${chain.name} has not been deployed yet.`);
      return;
    }
    setInputError("");
    setParams({ network, id: id.toString() });
    void lookup.refetchIfCurrent(trimmed);
  }

  return (
    <div className="public-page">
      <SiteHeader />
      <main>
        <section className="hero-section">
          <div className="hero-orb hero-orb-one" />
          <div className="hero-orb hero-orb-two" />
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="hero-kicker"><span className="kicker-spark"><Sparkles size={13} /></span> TRUSTED ACADEMIC CREDENTIALS</span>
              <h1>Verify an academic <em>certificate.</em></h1>
              <p className="hero-description">
                Check the authenticity and current status of an academic certificate directly against
                its permanent blockchain record.
              </p>
              <div className="hero-assurance">
                <span><Check size={14} /> Publicly verifiable</span>
                <span><Check size={14} /> No wallet required</span>
              </div>
            </div>

            <div className="verify-card">
              <div className="verify-card-head">
                <span className="verify-icon"><FileSearch size={21} /></span>
                <div>
                  <p className="eyebrow">INSTANT VERIFICATION</p>
                  <h2>Look up a certificate</h2>
                </div>
              </div>
              <p className="verify-prompt">Choose the issuing network and enter the ERC-721 token ID.</p>
              <form className="search-form" onSubmit={search}>
                <label htmlFor="verification-network">Network</label>
                <select id="verification-network" className="network-select" value={network} onChange={event => {
                  setParams({ network: event.target.value });
                  setInputError("");
                }}>
                  {networks.map(config => <option value={config.network} key={config.network}>{config.chain.name}</option>)}
                </select>
                <label htmlFor="certificate-id">Token ID</label>
                <div className={`search-input-wrap ${inputError ? "has-error" : ""}`}>
                  <Fingerprint size={18} />
                  <input
                    id="certificate-id"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="e.g. 1024"
                    inputMode="numeric"
                    maxLength={78}
                    autoComplete="off"
                  />
                  <span className="input-prefix">#</span>
                </div>
                {inputError ? <p className="field-error">{inputError}</p> : null}
                <button className="button button-primary verify-button" type="submit" disabled={lookup.isFetching}>
                  {lookup.isFetching ? <span className="spinner" /> : <Search size={17} />}
                  {lookup.isFetching ? "Checking blockchain…" : "Verify certificate"}
                  {!lookup.isFetching ? <ArrowRight size={16} /> : null}
                </button>
              </form>
              <div className="verify-card-foot"><LockKeyhole size={14} /> Secure public lookup · No personal wallet needed</div>

              {!deployed && <p className="field-error">There is no configured deployment on {chain.name}.</p>}
              {deployed && certificateId ? (
                <div className="lookup-result" aria-live="polite">
                  {lookup.isFetching ? <div className="inline-loading"><span className="spinner" /> Searching the registry…</div> : null}
                  {!lookup.isFetching && certificate && !lookup.error ? <CertificateDetails certificateId={certificateId} certificate={certificate} /> : null}
                  {!lookup.isFetching && lookup.isError ? (
                    <div className="not-found-result">
                      <span className="not-found-icon"><FileSearch size={20} /></span>
                      {isMissingCertificate(lookup.error)
                        ? <div><strong>Certificate not found</strong><p>No record exists for certificate #{certificateId.toString()}.</p></div>
                        : <div><strong>Could not verify the certificate</strong><p>{describeError(lookup.error)}</p></div>}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="hero-bottom-rule" />
        </section>

        <section className="trust-strip" aria-label="Registry properties">
          <div><span className="trust-icon"><ShieldCheck size={18} /></span><strong>Verified at the source</strong><small>Read directly from the contract</small></div>
          <div><span className="trust-icon"><Fingerprint size={18} /></span><strong>Unique certificate IDs</strong><small>Each credential has its own record</small></div>
          <div><span className="trust-icon"><LockKeyhole size={18} /></span><strong>Transparent status</strong><small>Valid and revoked records are clear</small></div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-heading">
            <p className="eyebrow">A CLEARER WAY TO VERIFY</p>
            <h2>How verification works</h2>
            <p>Every check is a direct read from the university registry deployed on the blockchain.</p>
          </div>
          <div className="steps-grid">
            <article className="step-card"><div className="step-icon"><Search size={19} /></div><h3>Enter the certificate ID</h3><p>Use the unique ID shared by the university or the certificate holder.</p></article>
            <article className="step-card"><div className="step-icon"><Fingerprint size={19} /></div><h3>Check the blockchain</h3><p>The registry returns the stored record and its latest status.</p></article>
            <article className="step-card"><div className="step-icon"><ShieldCheck size={19} /></div><h3>Review the result</h3><p>Confirm the student's details, award, grade and issue date in one place.</p></article>
          </div>
        </section>

        <section className="institution-cta">
          <div className="cta-art"><div className="cta-medal"><ShieldCheck size={32} /></div></div>
          <div><p className="eyebrow">FOR UNIVERSITY STAFF</p><h2>Issue and manage credentials</h2><p>Authorized administrators can securely issue individual or bulk certificates and maintain the registry.</p></div>
          <Link className="button button-light" to="/admin">Open administration <ArrowRight size={16} /></Link>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-inner"><span>© {currentYear} VERITY Academic Registry</span><span><ShieldCheck size={14} /> Public records are read directly from the configured blockchain registry</span></div>
      </footer>
    </div>
  );
}
