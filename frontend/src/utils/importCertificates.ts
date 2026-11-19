import { read, SSF, utils } from "xlsx";
import type { CertificateDraft, CertificateInput } from "../types/certificate";
import { canonicalStudentId, validateCertificateDraft } from "./certificates";

export const importColumns = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade", "recipientAddress"] as const;
const ROW_LIMIT = 500;

export type ImportRow = {
  rowNumber: number;
  draft: CertificateDraft;
  data?: CertificateInput;
  errors: string[];
  issuedId?: bigint;
};

export function parseCertificateFile(bytes: ArrayBuffer): ImportRow[] {
  const workbook = read(bytes, { type: "array", raw: true, sheetRows: ROW_LIMIT + 2, sheets: 0 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const reference = sheet?.["!ref"];
  if (!reference) throw new Error("The first worksheet is empty.");

  const range = utils.decode_range(reference);
  if (range.e.r - range.s.r > ROW_LIMIT || range.e.c - range.s.c >= 64) {
    throw new Error("Use a sheet with up to 500 data rows and 64 columns.");
  }
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
  const headers = rows.shift()?.map(value => String(value).trim().replace(/^\uFEFF/, "")) ?? [];
  const missing = importColumns.filter(column => !headers.includes(column));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}.`);
  if (importColumns.some(column => headers.indexOf(column) !== headers.lastIndexOf(column))) {
    throw new Error("Each certificate column must appear only once.");
  }

  const seen = new Map<string, ImportRow[]>();
  const result: ImportRow[] = [];
  rows.forEach((values, index) => {
    if (values.every(value => String(value).trim() === "")) return;
    const draft = Object.fromEntries(importColumns.map(column => {
      const value = values[headers.indexOf(column)] ?? "";
      if (column !== "issueDate" || typeof value !== "number") return [column, String(value)];
      const date = Number.isInteger(value) && SSF.parse_date_code(value, { date1904: workbook.Workbook?.WBProps?.date1904 });
      return [column, date ? [String(date.y).padStart(4, "0"), String(date.m).padStart(2, "0"), String(date.d).padStart(2, "0")].join("-") : String(value)];
    })) as CertificateDraft;
    const validation = validateCertificateDraft(draft);
    const row = { rowNumber: range.s.r + index + 2, draft, data: validation.data, errors: Object.values(validation.errors) };
    result.push(row);
    const key = canonicalStudentId(draft.studentId);
    if (key) {
      const group = seen.get(key) ?? [];
      group.push(row);
      seen.set(key, group);
    }
  });
  if (!result.length) throw new Error("The first worksheet has no certificate rows.");
  for (const group of seen.values()) {
    if (group.length > 1) group.forEach(row => row.errors.push("Duplicate student ID in this file."));
  }
  return result;
}

export function downloadValidationReport(rows: ImportRow[]) {
  const records = rows.map(row => [row.rowNumber, row.errors.join(" "), row.issuedId?.toString() ?? ""]);
  const csv = utils.sheet_to_csv(utils.aoa_to_sheet([["row", "validationErrors", "issuedTokenId"], ...records]));
  const address = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = address;
  link.download = "certificate-validation.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(address), 1000);
}

