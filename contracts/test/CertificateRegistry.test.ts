import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { getAddress, parseEventLogs, zeroAddress, zeroHash } from "viem";
import type { Address } from "viem";

const { viem, networkHelpers } = await network.create();
const client = await viem.getPublicClient();
const [admin, minter, student, other] = await viem.getWalletClients();
const studentAddress = getAddress(student.account.address);
const minterAddress = getAddress(minter.account.address);

function certificate(studentId = "DEMO-001", recipient: Address = studentAddress) {
  return {
    studentName: "Lina Atlas",
    studentId,
    diplomaTitle: 'Licence « Informatique » "Systèmes" \\ Réseaux 🎓',
    issueDate: 1704067200n,
    grade: 1650n,
    recipient,
  };
}

async function setup() {
  const registry = await viem.deployContract("CertificateRegistry", [admin.account.address]);
  return { registry, minterRole: await registry.read.MINTER_ROLE() };
}

function metadata(uri: string) {
  const prefix = "data:application/json;base64,";
  assert.ok(uri.startsWith(prefix));
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8")) as {
    name: string;
    attributes: { trait_type: string; value: string | number }[];
  };
}

describe("ERC-721 issuance and metadata", () => {
  it("advertises ERC-165, ERC-721, metadata and enumerable access control", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    for (const id of ["0x01ffc9a7", "0x80ac58cd", "0x5b5e139f", "0x7965db0b", "0x5a05180f"] as const) {
      assert.equal(await registry.read.supportsInterface([id]), true);
    }
    assert.equal(await registry.read.supportsInterface(["0xffffffff"]), false);
    assert.equal(await registry.read.symbol(), "VERITY");
  });

  it("mints to the recipient, emits ERC-721 and registry events, and returns the academic record", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const input = certificate();
    const { result } = await client.simulateContract({
      address: registry.address, abi: registry.abi, functionName: "mintCertificate",
      args: [input], account: admin.account.address,
    });
    assert.equal(result, 1n);
    const hash = await registry.write.mintCertificate([input]);
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    const [mint] = parseEventLogs({ abi: registry.abi, logs: receipt.logs, eventName: "CertificateMinted" });
    const [transfer] = parseEventLogs({ abi: registry.abi, logs: receipt.logs, eventName: "Transfer" });
    assert.deepEqual(mint.args, { tokenId: 1n, studentId: input.studentId, recipient: studentAddress });
    assert.deepEqual(transfer.args, { from: zeroAddress, to: studentAddress, tokenId: 1n });
    assert.equal(getAddress(await registry.read.ownerOf([1n])), studentAddress);
    assert.equal(await registry.read.balanceOf([studentAddress]), 1n);
    assert.equal(await registry.read.balanceOf([admin.account.address]), 0n);
    assert.deepEqual(await registry.read.getCertificate([1n]), { ...input, revoked: false, revokedAt: 0n });
  });

  it("returns valid UTF-8 JSON without student name or university ID", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const input = certificate();
    await registry.write.mintCertificate([input]);
    const decoded = metadata(await registry.read.tokenURI([1n]));
    assert.equal(decoded.name, "Academic Certificate #1");
    assert.deepEqual(Object.fromEntries(decoded.attributes.map(({ trait_type, value }) => [trait_type, value])), {
      "Certificate number": "1", Diploma: input.diplomaTitle, "Issue date (Unix UTC)": Number(input.issueDate),
      Grade: "16.50", Status: "Valid",
    });
    assert.ok(!JSON.stringify(decoded).includes(input.studentId));
    assert.ok(!JSON.stringify(decoded).includes(input.studentName));
  });

  it("rejects public reads for unknown tokens", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    await viem.assertions.revertWithCustomError(registry.read.getCertificate([0n]), registry, "ERC721NonexistentToken");
    await viem.assertions.revertWithCustomError(registry.read.tokenURI([1n]), registry, "ERC721NonexistentToken");
    await viem.assertions.revertWithCustomError(registry.read.ownerOf([1n]), registry, "ERC721NonexistentToken");
  });

  it("blocks all transfer and approval entry points", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const destination = other.account.address;
    await registry.write.mintCertificate([certificate()]);
    await viem.assertions.revertWithCustomError(registry.write.transferFrom(
      [studentAddress, destination, 1n], { account: student.account },
    ), registry, "NonTransferable");
    await viem.assertions.revertWithCustomError(registry.write.safeTransferFrom(
      [studentAddress, destination, 1n], { account: student.account },
    ), registry, "NonTransferable");
    await viem.assertions.revertWithCustomError(registry.write.safeTransferFrom(
      [studentAddress, destination, 1n, "0x1234"], { account: student.account },
    ), registry, "NonTransferable");
    await viem.assertions.revertWithCustomError(registry.read.approve([destination, 1n]), registry, "NonTransferable");
    await viem.assertions.revertWithCustomError(registry.read.setApprovalForAll([destination, true]), registry, "NonTransferable");
    assert.equal(getAddress(await registry.read.ownerOf([1n])), studentAddress);
    assert.equal(await registry.read.getApproved([1n]), zeroAddress);
  });
});

describe("Authorization and revocation", () => {
  it("assigns both roles only to the designated initial administrator", async () => {
    const registry = await viem.deployContract("CertificateRegistry", [minterAddress]);
    const role = await registry.read.MINTER_ROLE();
    for (const value of [zeroHash, role]) {
      assert.equal(await registry.read.hasRole([value, minterAddress]), true);
      assert.equal(await registry.read.hasRole([value, admin.account.address]), false);
    }
    await viem.assertions.revertWithCustomError(
      viem.deployContract("CertificateRegistry", [zeroAddress]), registry, "ZeroAddress",
    );
  });

  it("rejects unauthorized single mint, batch mint, revocation and role management", async () => {
    const { registry, minterRole } = await networkHelpers.loadFixture(setup);
    const options = { account: student.account };
    await registry.write.mintCertificate([certificate()]);
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.mintCertificate([certificate("DEMO-002")], options), registry,
      "AccessControlUnauthorizedAccount", [studentAddress, minterRole],
    );
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[certificate("DEMO-002")]], options), registry, "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.revokeCertificate([1n], options), registry, "AccessControlUnauthorizedAccount", [studentAddress, zeroHash],
    );
    await viem.assertions.revertWithCustomError(
      registry.write.grantRole([minterRole, studentAddress], options), registry, "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.revokeRole([minterRole, admin.account.address], options), registry, "AccessControlUnauthorizedAccount",
    );
  });

  it("enumerates granted minters and enforces removal without changing revocation permissions", async () => {
    const { registry, minterRole } = await networkHelpers.loadFixture(setup);
    await registry.write.grantRole([minterRole, minterAddress]);
    assert.deepEqual((await registry.read.getRoleMembers([minterRole])).map(account => getAddress(account)), [
      getAddress(admin.account.address), minterAddress,
    ]);
    await registry.write.mintCertificate([certificate()], { account: minter.account });
    await viem.assertions.revertWithCustomError(
      registry.write.revokeCertificate([1n], { account: minter.account }), registry, "AccessControlUnauthorizedAccount",
    );
    await registry.write.revokeRole([minterRole, minterAddress]);
    assert.equal(await registry.read.hasRole([minterRole, minterAddress]), false);
    await viem.assertions.revertWithCustomError(
      registry.write.mintCertificate([certificate("DEMO-002")], { account: minter.account }),
      registry, "AccessControlUnauthorizedAccount",
    );
  });

  it("prevents removing the final administrator by either path", async () => {
    const { registry, minterRole } = await networkHelpers.loadFixture(setup);
    const account = admin.account.address;
    await viem.assertions.revertWithCustomError(registry.write.revokeRole([zeroHash, account]), registry, "LastAdministrator");
    await viem.assertions.revertWithCustomError(registry.write.renounceRole([zeroHash, account]), registry, "LastAdministrator");
    await viem.assertions.revertWithCustomError(registry.write.grantRole([minterRole, zeroAddress]), registry, "ZeroAddress");
    await registry.write.grantRole([zeroHash, minterAddress]);
    await registry.write.renounceRole([zeroHash, account]);
    assert.equal(await registry.read.hasRole([zeroHash, minterAddress]), true);
    assert.equal(await registry.read.hasRole([zeroHash, account]), false);
  });

  it("revokes once, updating metadata and preserving the academic record and ownership", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const input = certificate();
    await registry.write.mintCertificate([input]);
    await viem.assertions.emitWithArgs(registry.write.revokeCertificate([1n]), registry, "CertificateRevoked", [1n]);
    assert.deepEqual(await registry.read.getCertificate([1n]), {
      ...input, revoked: true, revokedAt: BigInt(await networkHelpers.time.latest()),
    });
    assert.equal(getAddress(await registry.read.ownerOf([1n])), studentAddress);
    assert.equal(await registry.read.balanceOf([studentAddress]), 1n);
    assert.equal(await registry.read.totalCertificates(), 1n);
    assert.equal(metadata(await registry.read.tokenURI([1n])).attributes.find(x => x.trait_type === "Status")?.value, "Revoked");
    await viem.assertions.revertWithCustomError(registry.write.revokeCertificate([1n]), registry, "AlreadyRevoked");
    await viem.assertions.revertWithCustomError(registry.write.revokeCertificate([2n]), registry, "ERC721NonexistentToken");
    assert.equal(await registry.read.isStudentIdIssued([input.studentId]), true);
    await viem.assertions.revertWithCustomError(registry.write.mintCertificate([input]), registry, "DuplicateStudentId");
  });
});

describe("Validation, atomic batches and receiver callbacks", () => {
  for (const [label, patch, error] of [
    ["empty name", { studentName: "" }, "InvalidText"],
    ["blank diploma", { diplomaTitle: "   " }, "InvalidText"],
    ["control character", { diplomaTitle: "Data\nScience" }, "InvalidText"],
    ["excessively long name", { studentName: "é".repeat(61) }, "InvalidText"],
    ["excessively long diploma", { diplomaTitle: "a".repeat(161) }, "InvalidText"],
    ["empty student ID", { studentId: "" }, "InvalidStudentId"],
    ["lowercase student ID", { studentId: "demo-001" }, "InvalidStudentId"],
    ["student ID with surrounding whitespace", { studentId: " DEMO-001 " }, "InvalidStudentId"],
    ["excessively long ID", { studentId: "A".repeat(81) }, "InvalidStudentId"],
    ["zero recipient", { recipient: zeroAddress }, "ZeroAddress"],
    ["zero date", { issueDate: 0n }, "InvalidIssueDate"],
    ["future date", { issueDate: 9_999_999_999n }, "InvalidIssueDate"],
    ["grade above 20", { grade: 2001n }, "InvalidGrade"],
  ] as const) {
    it(`rejects ${label}`, async () => {
      const { registry } = await networkHelpers.loadFixture(setup);
      await viem.assertions.revertWithCustomError(registry.write.mintCertificate([{ ...certificate(), ...patch }]), registry, error);
      assert.equal(await registry.read.totalCertificates(), 0n);
    });
  }

  it("rejects an existing student ID with a different diploma across transactions", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const input = certificate();
    await registry.write.mintCertificate([input]);
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[{ ...input, diplomaTitle: "A different diploma" }]]), registry, "DuplicateStudentId",
    );
    assert.equal(await registry.read.totalCertificates(), 1n);
  });

  it("mints a batch with sequential IDs, distinct owners, correct events and grade boundaries", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const recipients = [studentAddress, getAddress(other.account.address)];
    const inputs = [{ ...certificate("X-1", recipients[0]), grade: 0n }, { ...certificate("X-2", recipients[1]), grade: 2000n }];
    const { logs, status } = await client.waitForTransactionReceipt({ hash: await registry.write.batchMintCertificates([inputs]) });
    assert.equal(status, "success");
    const minted = parseEventLogs({ abi: registry.abi, logs, eventName: "CertificateMinted" });
    const transfers = parseEventLogs({ abi: registry.abi, logs, eventName: "Transfer" });
    assert.deepEqual(minted.map(event => event.args.tokenId), [1n, 2n]);
    assert.deepEqual(transfers.map(event => event.args.tokenId), [1n, 2n]);
    for (const [index, input] of inputs.entries()) {
      const id = BigInt(index + 1);
      assert.equal(getAddress(await registry.read.ownerOf([id])), input.recipient);
      assert.equal(metadata(await registry.read.tokenURI([id])).attributes.find(x => x.trait_type === "Grade")?.value, index === 0 ? "0.00" : "20.00");
    }
  });

  it("rejects batches outside the 1–16 bound", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    await viem.assertions.revertWithCustomError(registry.write.batchMintCertificates([[]]), registry, "InvalidBatchSize");
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([Array.from({ length: 17 }, (_, index) => certificate(`B-${index}`))]),
      registry, "InvalidBatchSize",
    );
    assert.equal(await registry.read.totalCertificates(), 0n);
  });

  it("rolls back an entire batch when an ID repeats within it", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[certificate(), certificate()]]), registry, "DuplicateStudentId",
    );
    assert.equal(await registry.read.totalCertificates(), 0n);
    assert.equal(await registry.read.balanceOf([studentAddress]), 0n);
    assert.equal(await registry.read.isStudentIdIssued(["DEMO-001"]), false);
    await registry.write.mintCertificate([certificate()]);
    assert.equal(await registry.read.totalCertificates(), 1n);
  });

  it("keeps the lock engaged and the full record readable through safe receiver callbacks", async () => {
    const registry = await viem.deployContract("ObservableRegistry", [admin.account.address]);
    const receiver = await viem.deployContract("ObservingReceiver");
    await registry.write.mintCertificate([certificate("R-1", receiver.address)]);
    assert.equal(await receiver.read.observed(), true);
    assert.equal(await registry.read.mintLockEntered(), false);
    const secondReceiver = await viem.deployContract("ObservingReceiver");
    await registry.write.batchMintCertificates([[certificate("R-2", secondReceiver.address), certificate("R-3")]]);
    assert.equal(await secondReceiver.read.observed(), true);
    assert.equal(await registry.read.totalCertificates(), 3n);
  });

  it("rolls back every record if a recipient contract cannot receive NFTs", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[certificate("R-1"), certificate("R-2", registry.address)]]),
      registry, "ERC721InvalidReceiver",
    );
    assert.equal(await registry.read.totalCertificates(), 0n);
    assert.equal(await registry.read.isStudentIdIssued(["R-1"]), false);
    assert.equal(await registry.read.isStudentIdIssued(["R-2"]), false);
  });

  it("fits a 16-record bounded, maximum-length EOA batch under 12 million gas", async () => {
    const { registry } = await networkHelpers.loadFixture(setup);
    const inputs = Array.from({ length: 16 }, (_, index) => ({
      ...certificate(`B-${index}`.padEnd(80, "X")),
      studentName: "é".repeat(60),
      diplomaTitle: "🎓".repeat(40),
    }));
    const receipt = await client.waitForTransactionReceipt({ hash: await registry.write.batchMintCertificates([inputs]) });
    assert.equal(receipt.status, "success");
    assert.ok(receipt.gasUsed < 12_000_000n, `Batch used ${receipt.gasUsed} gas`);
    assert.equal(await registry.read.totalCertificates(), 16n);
  });
});
