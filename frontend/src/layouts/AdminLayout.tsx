import { useState } from "react";
import {
  ArrowLeft, ArrowUpRight, BookOpenCheck, FilePlus2, Files,
  LayoutDashboard, LogOut, Network, ShieldCheck, ShieldEllipsis, Wallet,
} from "lucide-react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useConnection, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { BrandMark } from "../components/SiteHeader";
import { ADMIN_ROLE, MINTER_ROLE, networks, useRegistry } from "../config/blockchain";
import { useRole } from "../hooks/useRegistryRead";
import { shortAddress } from "../utils/certificates";
import type { Address } from "viem";
import { adminRequired, describeError, minterRequired } from "../services/registry";
import { Feedback } from "../components/AdminUi";

export type AdminContext = { address: Address; canAdminister: boolean; canMint: boolean };

const adminNavigation = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/issue", label: "Issue certificate", icon: FilePlus2, required: "minter" },
  { to: "/admin/import", label: "Bulk import", icon: Files, required: "minter" },
  { to: "/admin/manage", label: "Manage certificates", icon: BookOpenCheck },
  { to: "/admin/administrators", label: "Administration", icon: ShieldEllipsis, required: "admin" },
];

export function AdminLayout() {
  const { address, chainId, isConnected, isReconnecting } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending: isConnecting, error: connectError } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain, isPending: isSwitching } = useSwitchChain();
  const [networkError, setNetworkError] = useState("");
  const { chain, deployed, network } = useRegistry();
  const isExpectedChain = chainId === chain.id;
  const roleAddress = isConnected && isExpectedChain && deployed ? address : undefined;
  const admin = useRole(ADMIN_ROLE, roleAddress);
  const minter = useRole(MINTER_ROLE, roleAddress);
  const canAdminister = admin.data === true;
  const canMint = minter.data === true;
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = adminNavigation.find(page => page.to === location.pathname.toLowerCase().replace(/\/$/, ""));
  const publicLink = `/?network=${network}`;

  async function handleNetworkSwitch(nextId: 31337 | 11155111) {
    setNetworkError("");
    try {
      await switchChain({ chainId: nextId });
      if (isExpectedChain && deployed) void navigate("/admin");
    } catch (error) {
      setNetworkError(describeError(error));
    }
  }

  const switchOptions = networks.filter(config => config.chain.id !== chainId && config.deployed);
  const switchButtons = switchOptions.map(({ chain: target }) => (
    <button key={target.id} className="button button-secondary" type="button"
      onClick={() => void handleNetworkSwitch(target.id)} disabled={isSwitching}>
      <Network size={16} /> {isSwitching ? "Waiting for wallet…" : `Switch to ${target.name}`}
    </button>
  ));
  const publicBack = <Link to={publicLink} className="back-link"><ArrowLeft size={15} /> Public verification</Link>;
  const disconnectButton = <button className="back-link button-reset" onClick={() => disconnect()}><LogOut size={15} /> Disconnect</button>;

  if (isReconnecting) return <div className="admin-loading"><span className="spinner" /> Reconnecting wallet…</div>;

  if (!isConnected || !address) {
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark />{publicBack}</div>
        <div className="connect-card">
          <span className="connect-card-symbol"><Wallet size={25} /></span>
          <h1>Connect your university wallet</h1>
          <p>Connect MetaMask to check your registry roles on Hardhat Local or Sepolia.</p>
          <button className="button button-primary connect-wallet-button" type="button"
            disabled={isConnecting || connectors.length === 0}
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
            <Wallet size={17} /> {isConnecting ? "Connecting wallet…" : "Connect MetaMask"}
          </button>
          {connectError && <p className="field-error" role="alert">{describeError(connectError)}</p>}
        </div>
      </div>
    );
  }

  if (!isExpectedChain || !deployed) {
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark />{disconnectButton}</div>
        <div className="connect-card">
          <span className="connect-card-symbol warning-symbol"><Network size={25} /></span>
          <h1>{isExpectedChain ? `Registry unavailable on ${chain.name}` : `Switch to ${switchOptions[0]?.chain.name ?? chain.name}`}</h1>
          <p>{switchOptions.length ? "Use a network with a configured Verity deployment." : "Follow the deployment steps in the README to configure a registry."}</p>
          <div className="network-actions">{switchButtons}</div>
          {networkError && <p className="field-error" role="alert">{networkError}</p>}
        </div>
      </div>
    );
  }

  if (admin.isLoading || minter.isLoading) {
    return <div className="admin-loading"><span className="spinner" /> Checking on-chain wallet roles…</div>;
  }

  if (admin.isError || minter.isError || (!canAdminister && !canMint)) {
    const error = admin.error ?? minter.error;
    return (
      <div className="connect-page">
        <div className="connect-top"><BrandMark />{disconnectButton}</div>
        <div className="connect-card denied-card">
          <span className="connect-card-symbol denied-symbol"><ShieldEllipsis size={25} /></span>
          <h1>{error ? "Registry unavailable" : "Access denied"}</h1>
          <p>{error ? describeError(error) : `Wallet ${shortAddress(address)} has neither registry role on ${chain.name}. ${minterRequired}`}</p>
          <div className="network-actions">
            {error && <button className="button button-primary" onClick={() => void Promise.all([admin.refetch(), minter.refetch()])}>Try again</button>}
            {switchButtons}
            {publicBack}
          </div>
          {networkError && <p className="field-error" role="alert">{networkError}</p>}
        </div>
      </div>
    );
  }

  const forbidden = currentPage?.required === "minter" && !canMint ? minterRequired
    : currentPage?.required === "admin" && !canAdminister ? adminRequired : undefined;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <BrandMark />
        <nav className="admin-nav" aria-label="Administration">
          {adminNavigation.filter(page =>
            (!page.required || (page.required === "minter" ? canMint : canAdminister)),
          ).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-network"><span className="network-dot" /><span><strong>{chain.name}</strong><small>Chain ID {chain.id}</small></span></div>
          <Link to={publicLink} className="back-to-public"><ArrowLeft size={15} /> Public verification <ArrowUpRight size={13} /></Link>
          <div className="sidebar-privacy"><ShieldCheck size={15} /><span>Student details are public on this network. Use fictional records for demos.</span></div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="network-actions">{switchButtons.length ? switchButtons : <span>Certificate management</span>}{networkError && <span className="field-error" role="alert">{networkError}</span>}</div>
          <div className="wallet-chip">
            <span className="wallet-status-dot" />
            <span className="wallet-chip-address" title={address}>{shortAddress(address)}</span>
            <span className="admin-tag"><ShieldCheck size={12} /> {canAdminister ? "Admin" : "Minter"}</span>
            <button type="button" className="icon-button wallet-disconnect" title="Disconnect wallet" onClick={() => disconnect()}><LogOut size={15} /></button>
          </div>
        </header>
        <main className="admin-content" key={`${chain.id}:${address}`}>
          {forbidden ? <Feedback error>{forbidden}</Feedback> : <Outlet context={{ address, canAdminister, canMint } satisfies AdminContext} />}
        </main>
      </div>
    </div>
  );
}
