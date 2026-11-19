import { getAddress, isAddress, zeroAddress } from "viem";
import type { Address } from "viem";
import type { CertificateDraft, CertificateInput } from "../types/certificate";

const textEncoder = new TextEncoder();
const maxCertificateId = (1n << 256n) - 1n;
function containsControls(value: string) {
  return [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function canonicalStudentId(value: string): string {
  return value.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
}

export function parseCertificateId(value: string): bigint | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,78}$/.test(trimmed)) return;
  const id = BigInt(trimmed);
  if (id > 0n && id <= maxCertificateId) return id;
}

export type ValidationResult = {
  data?: CertificateInput;
  errors: Record<string, string>;
};

export function emptyDraft(): CertificateDraft {
  return {
    studentName: "",
    studentId: "",
    diplomaTitle: "",
    issueDate: new Date().toISOString().slice(0, 10),
    grade: "",
    recipientAddress: "",
  };
}

export function validateCertificateDraft(draft: CertificateDraft): ValidationResult {
  const errors: Record<string, string> = {};
  const studentName = draft.studentName.trim();
  const studentId = canonicalStudentId(draft.studentId);
  const diplomaTitle = draft.diplomaTitle.trim();

  if (!studentName) errors.studentName = "Enter the student's full name.";
  else if (textEncoder.encode(studentName).length > 120) errors.studentName = "The name exceeds 120 UTF-8 bytes.";
  else if (containsControls(studentName)) errors.studentName = "The name cannot contain control characters.";
  if (!studentId) errors.studentId = "Enter the university student ID.";
  else if (!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(studentId)) {
    errors.studentId = "Use up to 80 letters, digits, periods, underscores or hyphens. Start with a letter or digit.";
  }
  if (!diplomaTitle) errors.diplomaTitle = "Enter the diploma or degree title.";
  else if (textEncoder.encode(diplomaTitle).length > 160) errors.diplomaTitle = "The title exceeds 160 UTF-8 bytes.";
  else if (containsControls(diplomaTitle)) errors.diplomaTitle = "The title cannot contain control characters.";

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.issueDate.trim());
  let issueDate = 0n;
  if (!dateMatch) {
    errors.issueDate = "Use a valid date in YYYY-MM-DD format.";
  } else {
    const isoDate = new Date(`${draft.issueDate.trim()}T00:00:00.000Z`);
    if (
      Number.isNaN(isoDate.getTime()) ||
      isoDate.toISOString().slice(0, 10) !== draft.issueDate.trim()
    ) {
      errors.issueDate = "That calendar date does not exist.";
    } else {
      issueDate = BigInt(Math.floor(isoDate.getTime() / 1000));
      if (issueDate <= 0n) {
        errors.issueDate = "Use a date after January 1, 1970.";
      } else if (issueDate > BigInt(Math.floor(Date.now() / 1000))) {
        errors.issueDate = "The issue date cannot be in the future.";
      }
    }
  }

  const gradeText = draft.grade.trim().replace(",", ".");
  const gradeMatch = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(gradeText);
  let grade = 0n;
  if (!gradeMatch) {
    errors.grade = "Enter a grade from 0 to 20 with up to two decimals.";
  } else {
    const whole = Number(gradeMatch[1]);
    const decimals = Number((gradeMatch[2] ?? "").padEnd(2, "0"));
    grade = BigInt(whole * 100 + decimals);
    if (grade > 2000n) errors.grade = "The maximum grade is 20.00.";
  }

  const addressText = draft.recipientAddress.trim();
  let recipient: Address = zeroAddress;
  if (!addressText) errors.recipientAddress = "Enter the recipient's Ethereum address.";
  else if (!isAddress(addressText)) errors.recipientAddress = "Enter a valid Ethereum address.";
  else if (getAddress(addressText) === zeroAddress) errors.recipientAddress = "The recipient address cannot be zero.";
  else recipient = getAddress(addressText);

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    data: { studentName, studentId, diplomaTitle, issueDate, grade, recipient },
  };
}

export function formatGrade(grade: bigint): string {
  return `${(grade / 100n).toString()}.${(grade % 100n).toString().padStart(2, "0")}`;
}

export function formatIssueDate(timestamp: bigint): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Number(timestamp) * 1000));
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
