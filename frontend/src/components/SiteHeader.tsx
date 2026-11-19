import { ArrowUpRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link className="brand-mark" to="/" aria-label="Verity Academic Registry home">
      <span className="brand-icon"><ShieldCheck size={22} strokeWidth={2.3} /></span>
      <span className="brand-copy">
        <strong>VERITY</strong>
        <small>ACADEMIC REGISTRY</small>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <BrandMark />
        <nav className="public-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link className="nav-admin-link" to="/admin">
            <BadgeCheck size={16} /> Administrator portal <ArrowUpRight size={15} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
