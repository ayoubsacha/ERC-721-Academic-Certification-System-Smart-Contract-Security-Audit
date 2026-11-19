import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { read, utils, write } from "xlsx";

// Use the unlocked, disposable accounts of a local Hardhat node only.
const rpcUrl = process.env.VERITY_TEST_RPC_URL ?? "http://127.0.0.1:8545";
assert.match(rpcUrl, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/, "Use a local Hardhat RPC for this test.");
const app = process.env.VERITY_TEST_URL ?? "http://127.0.0.1:5173";
const evidenceDir = process.env.VERITY_EVIDENCE_DIR;
let rpcId = 0;
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const { result, error } = await response.json();
  if (error) throw Object.assign(new Error(error.message), error);
  return result;
}
assert.equal(await rpc("eth_chainId"), "0x7a69", "Start a local Hardhat node before this test.");
const [owner, recipient, , , guest] = await rpc("eth_accounts");
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_EXECUTABLE, headless: true });
const failures = [];
const runId = String(Date.now()).slice(-8);
const waitText = (page, text) => page.getByText(text, { exact: true }).first().waitFor();
const click = (page, name) => page.getByRole("button", { name, exact: true }).click();
if (evidenceDir) await mkdir(evidenceDir, { recursive: true });

async function capture(page, fileName) {
  if (evidenceDir) await page.screenshot({ path: join(evidenceDir, fileName), fullPage: true });
}

const sampleFile = new URL("../public/sample-certificates.xlsx", import.meta.url);
const sample = read(await readFile(sampleFile));
const sampleSheet = sample.Sheets[sample.SheetNames[0]];
const sampleRows = utils.sheet_to_json(sampleSheet, { header: 1 });
for (const row of sampleRows.slice(1)) row[1] += "-" + runId;
sample.Sheets[sample.SheetNames[0]] = utils.aoa_to_sheet(sampleRows);
const sampleUpload = {
  name: "sample-certificates.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: write(sample, { bookType: "xlsx", type: "buffer" }),
};

async function walletPage(account, startChain = "0x7a69") {
  const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  let writes = 0;
  let rejectionAt = Number.POSITIVE_INFINITY;
  const rejected = () => ({ error: { code: 4001, message: "User rejected the request." } });
  await page.exposeFunction("hardhatBrowserRpc", async ({ method, params }) => {
    if (method === "eth_sendTransaction" && ++writes === rejectionAt) return rejected();
    try { return { value: await rpc(method, params) }; }
    catch (error) { return { error: { code: error.code, message: error.message, data: error.data } }; }
  });
  await page.addInitScript(({ account, startChain }) => {
    const listeners = new Map();
    const emit = (event, value) => listeners.get(event)?.forEach(callback => callback(value));
    let permitted = false;
    let chainId = startChain;
    const provider = {
      isMetaMask: true,
      get chainId() { return chainId; },
      on(event, callback) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
      },
      removeListener(event, callback) { listeners.get(event)?.delete(callback); },
      async request({ method, params = [] }) {
        if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") {
          permitted = true;
          emit("accountsChanged", [account]);
          return method === "eth_requestAccounts" ? [account] : [{ parentCapability: "eth_accounts" }];
        }
        if (method === "eth_accounts") return permitted ? [account] : [];
        if (method === "eth_chainId") return chainId;
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
          chainId = params[0].chainId;
          emit("chainChanged", chainId);
          return null;
        }
        const result = await window.hardhatBrowserRpc({ method, params });
        if (result.error) throw Object.assign(new Error(result.error.message), result.error);
        return result.value;
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider });
  }, { account, startChain });
  page.on("pageerror", error => failures.push(error.message));
  return { page, rejectNextAfter: count => { rejectionAt = writes + count; } };
}

try {
  const { page: guestPage } = await walletPage(guest);
  await guestPage.goto(app + "/admin/issue");
  await click(guestPage, "Connect MetaMask");
  await waitText(guestPage, "Access denied");
  await guestPage.getByText(/lacks the minter role/).waitFor();
  console.log("PASS unauthorized wallet denied");

  const { page: adminPage, rejectNextAfter } = await walletPage(owner, "0x1");
  await adminPage.goto(app + "/admin");
  await click(adminPage, "Connect MetaMask");
  await adminPage.getByRole("heading", { name: "Switch to Hardhat Local" }).waitFor();
  await click(adminPage, "Switch to Hardhat Local");
  await waitText(adminPage, "Certificate dashboard");
  await waitText(adminPage, "Administrator · Minter");
  console.log("PASS administrator connection, chain switching and dashboard");

  await adminPage.getByRole("link", { name: "Issue certificate", exact: true }).click();
  await click(adminPage, "Review certificate");
  await waitText(adminPage, "Enter the student's full name.");
  await waitText(adminPage, "Enter the recipient's Ethereum address.");
  await adminPage.getByLabel("Student full name").fill("Amal El Mansouri");
  await adminPage.getByLabel("Student ID", { exact: true }).fill("QA-" + runId);
  await adminPage.getByLabel("Diploma title").fill("Bachelor of Computer Science");
  await adminPage.getByLabel("Issue date").fill("2024-06-15");
  await adminPage.getByLabel("Final grade / 20").fill("16.50");
  await adminPage.getByLabel("Recipient wallet address").fill(recipient);
  await click(adminPage, "Review certificate");
  await click(adminPage, "Confirm issuance");
  const confirmed = adminPage.getByText(/^Certificate #\d+ issued$/);
  await confirmed.waitFor();
  const id = (await confirmed.textContent()).match(/\d+/)[0];
  await capture(adminPage, "successful-mint.png");
  assert.match(await adminPage.locator(".transaction-hash").innerText(), /^0x[\da-f]{64}$/);
  assert.equal(await adminPage.getByRole("link", { name: "Verify token" }).getAttribute("href"), `/?network=local&id=${id}`);
  console.log("PASS single issuance and real receipt for certificate #" + id);

  const publicPage = await browser.newPage({ viewport: { width: 1366, height: 950 } });
  publicPage.on("pageerror", error => failures.push(error.message));
  await publicPage.goto(app);
  assert.equal(await publicPage.evaluate(() => typeof window.ethereum), "undefined");
  await publicPage.getByLabel("Token ID", { exact: true }).fill(id);
  await click(publicPage, "Verify certificate");
  await waitText(publicPage, "Valid");
  await waitText(publicPage, "Amal El Mansouri");
  assert.equal((await publicPage.locator(".result-chainline strong").innerText()).toLowerCase(), recipient);
  await publicPage.getByText("Token URI and metadata", { exact: true }).click();
  const uri = await publicPage.getByTestId("token-uri").innerText();
  const decoded = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
  assert.ok(decoded.attributes.some(attribute => attribute.trait_type === "Status" && attribute.value === "Valid"));
  await capture(publicPage, "public-desktop.png");
  await publicPage.getByLabel("Token ID", { exact: true }).fill("99999999");
  await click(publicPage, "Verify certificate");
  await waitText(publicPage, "Certificate not found");
  console.log("PASS wallet-free valid and missing certificate lookup");

  await adminPage.getByRole("link", { name: "Manage certificates", exact: true }).click();
  await adminPage.getByLabel("Certificate ID", { exact: true }).fill(id);
  await click(adminPage, "Search");
  await click(adminPage, "Revoke certificate");
  await click(adminPage, "Confirm revocation");
  await adminPage.getByText(new RegExp("Certificate #" + id + " revoked. Transaction")).waitFor();
  await publicPage.getByLabel("Token ID", { exact: true }).fill(id);
  await click(publicPage, "Verify certificate");
  await waitText(publicPage, "Revoked");
  await waitText(publicPage, "Amal El Mansouri");
  await publicPage.getByText("Token URI and metadata", { exact: true }).click();
  const revokedUri = await publicPage.getByTestId("token-uri").innerText();
  const revokedMetadata = JSON.parse(Buffer.from(revokedUri.split(",")[1], "base64").toString("utf8"));
  assert.ok(revokedMetadata.attributes.some(attribute => attribute.trait_type === "Status" && attribute.value === "Revoked"));
  assert.equal((await publicPage.locator(".result-chainline strong").innerText()).toLowerCase(), recipient);
  await capture(publicPage, "revoked-token.png");
  console.log("PASS revocation, historical ownership and dynamic revoked metadata");

  await adminPage.getByRole("link", { name: "Administration", exact: true }).click();
  await adminPage.getByLabel("Wallet address", { exact: true }).fill(guest);
  await click(adminPage, "Add minter");
  await click(adminPage, "Grant access");
  await adminPage.getByText(/Minter access granted/).waitFor();
  await guestPage.reload();
  const connectAgain = guestPage.getByRole("button", { name: "Connect MetaMask", exact: true });
  await connectAgain.or(guestPage.getByRole("heading", { name: "Issue a certificate" })).first().waitFor();
  if (await connectAgain.isVisible()) await connectAgain.click();
  await waitText(guestPage, "Issue a certificate");
  assert.equal(await guestPage.getByRole("link", { name: "Administration", exact: true }).count(), 0);
  await guestPage.getByLabel("Student full name").fill("Nora Atlas");
  await guestPage.getByLabel("Student ID", { exact: true }).fill("MINTER-" + runId);
  await guestPage.getByLabel("Diploma title").fill("Licence Mathématiques");
  await guestPage.getByLabel("Issue date").fill("2024-06-15");
  await guestPage.getByLabel("Final grade / 20").fill("16.50");
  await guestPage.getByLabel("Recipient wallet address").fill(recipient);
  await click(guestPage, "Review certificate");
  await click(guestPage, "Confirm issuance");
  const minterConfirmation = guestPage.getByText(/^Certificate #\d+ issued$/);
  await minterConfirmation.waitFor();
  const minterTokenId = (await minterConfirmation.textContent()).match(/\d+/)[0];
  await guestPage.goto(app + "/admin/administrators");
  await connectAgain.or(guestPage.getByText(/lacks the administrator role/)).first().waitFor();
  if (await connectAgain.isVisible()) await connectAgain.click();
  await guestPage.getByText(/lacks the administrator role/).waitFor();
  await guestPage.getByRole("link", { name: "Manage certificates", exact: true }).click();
  await guestPage.getByLabel("Certificate ID", { exact: true }).fill(minterTokenId);
  await click(guestPage, "Search");
  await waitText(guestPage, "Valid");
  assert.equal(await guestPage.getByRole("button", { name: "Revoke certificate", exact: true }).count(), 0);
  await adminPage.locator(".admin-wallet-list li").filter({ hasText: new RegExp(guest, "i") }).getByRole("button", { name: "Remove", exact: true }).click();
  await click(adminPage, "Remove access");
  await adminPage.getByText(/Minter access removed/).waitFor();
  await waitText(guestPage, "Access denied");
  console.log("PASS admin grants and removes access and minter permissions are limited");

  await adminPage.getByRole("link", { name: "Bulk import", exact: true }).click();
  const input = adminPage.locator("input[type=file]");
  await input.setInputFiles(sampleUpload);
  await waitText(adminPage, "4 valid");
  await adminPage.getByRole("checkbox", { name: "Select row 5", exact: true }).uncheck();
  await waitText(adminPage, "3 selected");
  await click(adminPage, "Review selected certificates");
  await click(adminPage, "Issue selected");
  await adminPage.getByText(/^Confirmed IDs/).first().waitFor();
  await input.setInputFiles(sampleUpload);
  await waitText(adminPage, "3 invalid");
  console.log("PASS real XLSX parsing, selection, batch mint and on-chain duplicate check");

  const legacyWorkbook = utils.book_new();
  const excelDate = (Date.UTC(2024, 5, 15) - Date.UTC(1899, 11, 30)) / 86_400_000;
  const legacySheet = utils.aoa_to_sheet([
    ["studentName", "studentId", "diplomaTitle", "issueDate", "grade", "recipientAddress"],
    ["Legacy Example", "XLS-" + runId, "Master of Mathematics", excelDate, 18.5, recipient],
  ]);
  legacySheet.D2.z = "yyyy-mm-dd";
  utils.book_append_sheet(legacyWorkbook, legacySheet, "Certificates");
  await input.setInputFiles({
    name: "example.xls", mimeType: "application/vnd.ms-excel",
    buffer: write(legacyWorkbook, { bookType: "biff8", type: "buffer" }),
  });
  await waitText(adminPage, "1 valid");
  await waitText(adminPage, "2024-06-15");
  console.log("PASS XLS parsing and Excel serial dates");

  const header = "studentName,studentId,diplomaTitle,issueDate,grade,recipientAddress";
  const valid = Array.from({ length: 11 }, (_, i) => "Student " + i + ",CSV-" + runId + "-" + i + ",Bachelor,2024-06-15,15.25," + recipient);
  const invalid = [
    "Broken grade,INVALID-G-" + runId + ",Bachelor,2024-06-15,20.01," + recipient,
    "Broken date,INVALID-D-" + runId + ",Bachelor,2024-02-30,15," + recipient,
    "Broken wallet,INVALID-W-" + runId + ",Bachelor,2024-06-15,15,malformed",
    "Zero wallet,INVALID-Z-" + runId + ",Bachelor,2024-06-15,15,0x0000000000000000000000000000000000000000",
    "Missing wallet,INVALID-A-" + runId + ",Bachelor,2024-06-15,15,",
    "Duplicate,DUP-" + runId + ",Bachelor,2024-06-15,15," + recipient,
    "Duplicate,dup-" + runId + ",Master,2024-06-15,15," + recipient,
  ];
  await input.setInputFiles({ name: "validation.csv", mimeType: "text/csv", buffer: Buffer.from([header, ...valid, ...invalid].join("\n")) });
  await waitText(adminPage, "11 valid");
  await waitText(adminPage, "7 invalid");
  await click(adminPage, "Review selected certificates");
  await adminPage.getByText(/across 2 transaction/).waitFor();
  rejectNextAfter(2);
  await click(adminPage, "Issue selected");
  await adminPage.getByText(/^Confirmed IDs/).first().waitFor();
  await adminPage.getByText(/wallet request was rejected/i).waitFor();
  await waitText(adminPage, "1 selected");
  await capture(adminPage, "bulk-results.png");
  const download = adminPage.waitForEvent("download");
  await click(adminPage, "Validation report");
  assert.equal((await download).suggestedFilename(), "certificate-validation.csv");
  console.log("PASS CSV validation, confirmed first batch, rejected second batch and CSV report");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(app);
  await mobile.getByRole("button", { name: "Verify certificate", exact: true }).waitFor();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), 390);
  await capture(mobile, "public-mobile.png");
  await adminPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth), 390);
  await capture(adminPage, "admin-mobile.png");
  assert.deepEqual(failures, []);
  console.log("PASS mobile viewport layout and no uncaught browser errors");
} finally {
  await browser.close();
}

