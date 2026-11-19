import { defineChain, getAddress, isAddress, keccak256, stringToHex, zeroAddress, zeroHash } from "viem";
import { sepolia } from "viem/chains";
import { createConfig, http, injected, useConnection } from "wagmi";
import { useLocation } from "react-router-dom";
import { registryAbi } from "./certificateAbi";
export { registryAbi };

export const ADMIN_ROLE = zeroHash;
export const MINTER_ROLE = keccak256(stringToHex("MINTER_ROLE"));
const requestedBatchSize = Number(import.meta.env.VITE_BATCH_SIZE ?? 10);
export const BATCH_SIZE = Number.isInteger(requestedBatchSize) && requestedBatchSize >= 1 && requestedBatchSize <= 16
  ? requestedBatchSize
  : 10;

const local = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545"] } },
  testnet: true,
});
const sepoliaChain = {
  ...sepolia,
  rpcUrls: { default: { http: [import.meta.env.VITE_SEPOLIA_RPC_URL || sepolia.rpcUrls.default.http[0]] } },
};

type Deployment = { chainId: number; address: string; deploymentBlock: string };
const deploymentFiles = import.meta.glob<Deployment>(
  ["./deployment.local.json", "./deployment.sepolia.json"], { eager: true, import: "default" },
);

function configFor(chain: typeof local | typeof sepoliaChain, network: "local" | "sepolia") {
  const deployment = deploymentFiles[`./deployment.${network}.json`];
  const address = deployment?.chainId === chain.id && isAddress(deployment.address)
    ? getAddress(deployment.address)
    : zeroAddress;
  const deploymentBlock = /^\d+$/.test(deployment?.deploymentBlock ?? "") ? BigInt(deployment.deploymentBlock) : 0n;
  return { chain, network, address, deploymentBlock, deployed: address !== zeroAddress };
}

const localRegistry = configFor(local, "local");
const sepoliaRegistry = configFor(sepoliaChain, "sepolia");
export const networks = [localRegistry, sepoliaRegistry] as const;
const defaultRegistry = import.meta.env.VITE_DEFAULT_NETWORK === "sepolia" ? sepoliaRegistry : localRegistry;

export function useRegistry() {
  const location = useLocation();
  const connection = useConnection();
  const requested = new URLSearchParams(location.search).get("network");
  const selected = location.pathname.toLowerCase().startsWith("/admin")
    ? networks.find(config => config.chain.id === connection.chainId)
    : networks.find(config => config.network === requested);
  const config = selected ?? defaultRegistry;
  return { ...config, params: { address: config.address, abi: registryAbi, chainId: config.chain.id } as const };
}

export const wagmiConfig = createConfig({
  chains: [local, sepoliaChain],
  connectors: [injected({ target: "metaMask" })],
  multiInjectedProviderDiscovery: false,
  transports: { [local.id]: http(), [sepoliaChain.id]: http() },
});
