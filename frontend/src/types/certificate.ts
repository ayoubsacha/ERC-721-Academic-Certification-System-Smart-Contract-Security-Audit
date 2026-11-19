import type { Address } from "viem";

export type CertificateDraft = {
  studentName: string;
  studentId: string;
  diplomaTitle: string;
  issueDate: string;
  grade: string;
  recipientAddress: string;
};

export type CertificateInput = {
  studentName: string;
  studentId: string;
  diplomaTitle: string;
  issueDate: bigint;
  grade: bigint;
  recipient: Address;
};

export type CertificateRecord = {
  studentName: string;
  studentId: string;
  diplomaTitle: string;
  issueDate: bigint;
  grade: bigint;
  recipient: Address;
  revoked: boolean;
  revokedAt: bigint;
  owner: Address;
  tokenURI: string;
};

