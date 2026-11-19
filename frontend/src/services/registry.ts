import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, isAddressEqual, parseEventLogs, UserRejectedRequestError } from "viem";
import type { Abi, Address, ContractFunctionArgs, Hex } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { getConnection } from "wagmi/actions";
import { ADMIN_ROLE, MINTER_ROLE, registryAbi, useRegistry, wagmiConfig } from "../config/blockchain";
import type { CertificateInput } from "../types/certificate";

type WriteName = "mintCertificate" | "batchMintCertificates" | "revokeCertificate" | "grantRole" | "revokeRole";
type Operation = {
  [Name in WriteName]: { functionName: Name; args: ContractFunctionArgs<typeof registryAbi, "nonpayable", Name> }
}[WriteName];

function findRevert(error: unknown) {
  if (error instanceof BaseError) {
    const revert = error.walk(cause => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert;
  }
}

export function isMissingCertificate(error: unknown) {
  return findRevert(error)?.data?.errorName === "ERC721NonexistentToken";
}

export const minterRequired = "This wallet lacks the minter role (MINTER_ROLE).";
export const adminRequired = "This wallet lacks the administrator role (DEFAULT_ADMIN_ROLE).";

export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk(cause => cause instanceof UserRejectedRequestError) instanceof UserRejectedRequestError) {
      return "The wallet request was rejected.";
    }
    const data = findRevert(error)?.data;
    switch (data?.errorName) {
      case "AccessControlUnauthorizedAccount":
        if (data.args?.[1] === MINTER_ROLE) return minterRequired;
        if (data.args?.[1] === ADMIN_ROLE) return adminRequired;
        return "This wallet lacks the required registry role.";
      case "DuplicateStudentId": return `Student ID ${data.args?.[0]} has already been issued.`;
      case "AlreadyRevoked": return "This certificate is already revoked.";
      case "InvalidIssueDate": return "The issue date must be after the Unix epoch and at or before chain time.";
      case "ERC721InvalidReceiver": return "The recipient wallet contract does not accept ERC-721 tokens.";
      case "ERC721NonexistentToken": return "Certificate not found.";
      default: return findRevert(error)?.reason || error.shortMessage;
    }
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function useRegistryActions() {
  const { params, chain, deployed } = useRegistry();
  const { address, connector, chainId } = useConnection();
  const client = usePublicClient({ chainId: chain.id });
  const { mutateAsync } = useWriteContract();
  const queryClient = useQueryClient();

  async function isStudentIdIssued(studentId: string) {
    if (!client || !deployed) throw new Error("The selected registry is unavailable.");
    return client.readContract({ ...params, functionName: "isStudentIdIssued", args: [studentId] });
  }

  async function execute(operation: Operation) {
    if (!client || !deployed) throw new Error("The selected registry is unavailable.");
    if (!address || !connector || chainId !== chain.id) throw new Error(`Connect an authorized wallet on ${chain.name}.`);
    if (await client.getChainId() !== chain.id) throw new Error("The configured RPC serves a different network.");
    // Operation already binds each function name to the argument types from the generated ABI.
    const call = { ...params, ...operation, abi: registryAbi as Abi, account: address };
    await client.simulateContract(call);
    const current = getConnection(wagmiConfig);
    if (current.chainId !== chainId || !current.address || !isAddressEqual(current.address, address) ||
        current.connector?.uid !== connector.uid) {
      throw new Error("The connected wallet or network changed. Review the transaction again.");
    }
    const hash = await mutateAsync({ ...call, connector });
    let replacementReason: string | undefined;
    let replacementHash: Hex | undefined;
    const receipt = await client.waitForTransactionReceipt({
      hash, timeout: 90_000,
      onReplaced: replacement => { replacementReason = replacement.reason; replacementHash = replacement.transaction.hash; },
    }).catch(() => {
      throw new Error(`Confirmation is unknown for transaction ${replacementHash ?? hash}. Check the wallet before retrying.`);
    });
    if (replacementReason && replacementReason !== "repriced") {
      throw new Error(`Transaction ${hash} was replaced in the wallet. Replacement ${receipt.transactionHash}.`);
    }
    if (receipt.status !== "success") throw new Error(`Transaction ${receipt.transactionHash} reverted.`);
    const ids = parseEventLogs({
      abi: registryAbi, eventName: "CertificateMinted", strict: true,
      logs: receipt.logs.filter(log => isAddressEqual(log.address, params.address)),
    }).map(log => log.args.tokenId);

    void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === "readContract" || query.queryKey[0] === "registry" });
    const expected = operation.functionName === "mintCertificate" ? 1
      : operation.functionName === "batchMintCertificates" ? operation.args[0].length : 0;
    if (ids.length !== expected) {
      throw new Error(`Transaction ${receipt.transactionHash} confirmed with unexpected mint events. Review the receipt before retrying.`);
    }
    return { hash: receipt.transactionHash, ids, network: chain.id === 31337 ? "local" : "sepolia" };
  }

  return {
    isStudentIdIssued,
    mintCertificate: (certificate: CertificateInput) => execute({ functionName: "mintCertificate", args: [certificate] }),
    batchMint: (records: CertificateInput[]) => execute({ functionName: "batchMintCertificates", args: [records] }),
    revokeCertificate: (id: bigint) => execute({ functionName: "revokeCertificate", args: [id] }),
    grantMinter: (account: Address) => execute({ functionName: "grantRole", args: [MINTER_ROLE, account] }),
    revokeMinter: (account: Address) => execute({ functionName: "revokeRole", args: [MINTER_ROLE, account] }),
  };
}
