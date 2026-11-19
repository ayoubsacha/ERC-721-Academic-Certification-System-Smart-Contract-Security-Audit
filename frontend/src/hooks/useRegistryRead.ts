import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { MINTER_ROLE, useRegistry } from "../config/blockchain";
import { parseCertificateId } from "../utils/certificates";

export function useRole(role: Hex, address?: Address) {
  const { params, deployed } = useRegistry();
  return useReadContract({
    ...params, functionName: "hasRole", args: address ? [role, address] : undefined,
    query: { enabled: deployed && Boolean(address), retry: false, refetchInterval: 10_000 },
  });
}

export function useCertificateCount() {
  const { params, deployed } = useRegistry();
  return useReadContract({
    ...params, functionName: "totalCertificates",
    query: { enabled: deployed, retry: false, refetchInterval: 15_000 },
  });
}

export function useCertificate(certificateId?: bigint) {
  const { params, deployed } = useRegistry();
  const client = usePublicClient({ chainId: params.chainId });
  const query = useQuery({
    queryKey: ["registry", "certificate", params.chainId, params.address, certificateId?.toString()],
    enabled: deployed && Boolean(client && certificateId),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || certificateId === undefined) throw new Error("Select a deployed registry and token ID.");
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const args = [certificateId] as const;
      const record = await client.readContract({ ...params, functionName: "getCertificate", args, blockNumber });
      const [owner, tokenURI] = await Promise.all([
        client.readContract({ ...params, functionName: "ownerOf", args, blockNumber }),
        client.readContract({ ...params, functionName: "tokenURI", args, blockNumber }),
      ]);
      return { ...record, owner, tokenURI };
    },
  });
  return {
    ...query,
    refetchIfCurrent(input: string) {
      if (certificateId && parseCertificateId(input) === certificateId) return query.refetch();
    },
  };
}

export function useMinterList(enabled: boolean) {
  const { params, deployed } = useRegistry();
  return useReadContract({
    ...params, functionName: "getRoleMembers", args: [MINTER_ROLE],
    query: { enabled: deployed && enabled, retry: false, refetchInterval: 15_000 },
  });
}

export function useCertificatePage(total: bigint, page: number, size: number) {
  const { params, deployed } = useRegistry();
  const client = usePublicClient({ chainId: params.chainId });
  return useQuery({
    queryKey: ["registry", "page", params.chainId, params.address, total.toString(), page, size],
    enabled: deployed && Boolean(client) && total > 0n,
    retry: false,
    queryFn: async () => {
      const newest = total - BigInt(page * size);
      const length = newest > BigInt(size) ? size : Math.max(0, Number(newest));
      return Promise.all(Array.from({ length }, async (_, index) => {
        const id = newest - BigInt(index);
        return { id, certificate: await client!.readContract({ ...params, functionName: "getCertificate", args: [id] }) };
      }));
    },
  });
}

export function useCertificateActivity() {
  const { params, deployed, deploymentBlock } = useRegistry();
  const client = usePublicClient({ chainId: params.chainId });
  const window = params.chainId === 31337 ? 5000n : 500n;
  return useQuery({
    queryKey: ["registry", "activity", params.chainId, params.address, deploymentBlock.toString()],
    enabled: deployed && Boolean(client),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const latest = await client!.getBlockNumber();
      if (latest < deploymentBlock) throw new Error("Redeploy the registry after resetting the network.");
      const fromBlock = latest - deploymentBlock >= window ? latest - window + 1n : deploymentBlock;
      const [minted, revoked] = await Promise.all([
        client!.getContractEvents({ ...params, eventName: "CertificateMinted", fromBlock, toBlock: latest, strict: true }),
        client!.getContractEvents({ ...params, eventName: "CertificateRevoked", fromBlock, toBlock: latest, strict: true }),
      ]);
      return [
        ...minted.map(log => ({ kind: "issued", studentId: log.args.studentId, log })),
        ...revoked.map(log => ({ kind: "revoked", studentId: undefined, log })),
      ].sort((a, b) => Number(b.log.blockNumber - a.log.blockNumber) || b.log.logIndex - a.log.logIndex)
        .slice(0, 6).map(({ kind, studentId, log }) => ({
          kind, studentId, certificateId: log.args.tokenId, blockNumber: log.blockNumber,
          key: `${log.transactionHash}:${log.logIndex}`,
        }));
    },
  });
}
