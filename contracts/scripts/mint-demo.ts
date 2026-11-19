import { readFile } from "node:fs/promises";
import { network } from "hardhat";
import { getAddress, isAddress, parseEventLogs, zeroAddress } from "viem";
import { deploymentFile } from "./deployment-files.mjs";

const { viem, networkName } = await network.create();
const client = await viem.getPublicClient();
const chainId = await client.getChainId();
const expected = networkName === "localhost" ? 31337 : networkName === "sepolia" ? 11155111 : undefined;
if (chainId !== expected) throw new Error(`Unexpected chain ID ${chainId} on ${networkName}.`);
const deployment = JSON.parse(await readFile(deploymentFile(chainId), "utf8"));
if (deployment.chainId !== chainId || !isAddress(deployment.address) || deployment.address === zeroAddress) {
  throw new Error("Invalid deployment for this network.");
}
const wallets = await viem.getWalletClients();
const rawRecipient = process.env.DEMO_RECIPIENT || (chainId === 31337 ? wallets[1].account.address : undefined);
if (!rawRecipient || !isAddress(rawRecipient) || getAddress(rawRecipient) === zeroAddress) {
  throw new Error("Set DEMO_RECIPIENT to a valid non-zero address.");
}
const registry = await viem.getContractAt("CertificateRegistry", deployment.address);
const { timestamp } = await client.getBlock();
const hash = await registry.write.mintCertificate([{
  recipient: getAddress(rawRecipient),
  studentId: `DEMO-${Date.now()}`,
  studentName: "Samira Atlas",
  diplomaTitle: "Licence informatique",
  issueDate: timestamp / 86400n * 86400n,
  grade: 1650n,
}]);
console.log("Mint transaction:", hash);
const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
if (receipt.status !== "success") throw new Error("Demo mint reverted.");
const [event] = parseEventLogs({
  abi: registry.abi,
  eventName: "CertificateMinted",
  strict: true,
  logs: receipt.logs.filter(log => getAddress(log.address) === getAddress(registry.address)),
});
if (!event) throw new Error("Confirmed mint receipt has no registry event.");
console.log("Token ID:", event.args.tokenId.toString());
console.log("NFT owner:", await registry.read.ownerOf([event.args.tokenId]));
