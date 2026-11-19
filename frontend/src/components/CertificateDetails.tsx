import { CalendarDays, Fingerprint, GraduationCap, UserRound } from "lucide-react";
import { formatGrade, formatIssueDate } from "../utils/certificates";
import type { CertificateRecord } from "../types/certificate";
import { decodeMetadata } from "../utils/metadata";

export function CertificateDetails({
  certificateId,
  certificate,
}: {
  certificateId: bigint;
  certificate: CertificateRecord;
}) {
  const isRevoked = certificate.revoked;

  return (
    <article className={`certificate-result ${isRevoked ? "is-revoked" : "is-valid"}`}>
      <div className="result-topline">
        <div className="result-heading">
          <span className="result-icon"><GraduationCap size={19} /></span>
          <div>
            <p className="eyebrow">CERTIFICATE RECORD</p>
            <h3>Certificate #{certificateId.toString()}</h3>
            <small>ERC-721 token ID · {certificateId.toString()}</small>
          </div>
        </div>
        <span className={`status-pill ${isRevoked ? "status-revoked" : "status-valid"}`}>
          <span className="status-dot" /> {isRevoked ? "Revoked" : "Valid"}
        </span>
      </div>

      <div className="certificate-student">
        <div className="student-avatar"><UserRound size={21} /></div>
        <div>
          <span>AWARDED TO</span>
          <strong>{certificate.studentName}</strong>
          <small>Student ID · {certificate.studentId}</small>
        </div>
      </div>

      <div className="certificate-facts">
        <div className="certificate-fact">
          <span><GraduationCap size={15} /> DIPLOMA</span>
          <strong>{certificate.diplomaTitle}</strong>
        </div>
        <div className="certificate-fact">
          <span><CalendarDays size={15} /> ISSUE DATE</span>
          <strong>{formatIssueDate(certificate.issueDate)}</strong>
        </div>
        <div className="certificate-fact">
          <span><Fingerprint size={15} /> FINAL GRADE</span>
          <strong>{formatGrade(certificate.grade)} <small>/ 20</small></strong>
        </div>
      </div>

      <div className="result-chainline">
        <span>NFT OWNER</span>
        <strong className="mono break-text">{certificate.owner}</strong>
      </div>
      {isRevoked && (
        <p className="revocation-note">Revoked on {formatIssueDate(certificate.revokedAt)} (UTC). The original NFT remains in the recipient wallet.</p>
      )}
      <details className="token-metadata">
        <summary>Token URI and metadata</summary>
        <code data-testid="token-uri">{certificate.tokenURI}</code>
        <pre>{decodeMetadata(certificate.tokenURI) ?? "The token URI could not be decoded as JSON."}</pre>
      </details>
    </article>
  );
}
