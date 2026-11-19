import { network } from "hardhat";
import { getAddress, isAddress, zeroAddress } from "viem";
import { deploymentFile, writeAbi, writeDeployment } from "./deployment-files.mjs";

const { viem, networkName } = await network.create();
const client = await viem.getPublicClient();
const chainId = await client.getChainId();
const expected = networkName === "localhost" ? 31337 : networkName === "sepolia" ? 11155111 : undefined;
if (chainId !== expected) throw new Error(`Unexpected chain ID ${chainId} on ${networkName}.`);
const [wallet] = await viem.getWalletClients();

const configuredAdmin = chainId === 31337
  ? process.env.LOCAL_INITIAL_ADMIN || wallet.account.address
  : process.env.SEPOLIA_INITIAL_ADMIN;
if (!configuredAdmin || !isAddress(configuredAdmin) || getAddress(configuredAdmin) === zeroAddress) {
  throw new Error("Set a valid non-zero initial administrator address.");
}
const administrator = getAddress(configuredAdmin);
const { deploymentTransaction } = await viem.sendDeploymentTransaction("CertificateRegistry", [administrator]);
console.log("Deployment transaction:", deploymentTransaction.hash);
const receipt = await client.waitForTransactionReceipt({ hash: deploymentTransaction.hash, timeout: 180_000 });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Registry deployment reverted.");

const registry = await viem.getContractAt("CertificateRegistry", receipt.contractAddress);
const [admin, minter] = await Promise.all([registry.read.DEFAULT_ADMIN_ROLE(), registry.read.MINTER_ROLE()]);
if (!(await registry.read.hasRole([admin, administrator])) || !(await registry.read.hasRole([minter, administrator]))) {
  throw new Error("Deployment administrator role checks failed.");
}
await writeAbi();
await writeDeployment({
  chainId,
  address: receipt.contractAddress,
  deploymentBlock: receipt.blockNumber.toString(),
  transactionHash: receipt.transactionHash,
  administrator,
});
console.log("Registry address:", receipt.contractAddress);
console.log("Initial administrator:", administrator);
console.log("Frontend configuration:", deploymentFile(chainId).pathname);
