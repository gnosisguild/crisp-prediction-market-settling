"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ConnectWallet";
import { activeChain } from "@/lib/wagmi";

const tabs = [
  { href: "/", label: "Markets" },
  { href: "/create", label: "Create" },
  { href: "/oracle", label: "Oracle" },
];

export function TopBar() {
  const pathname = usePathname();
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">P</div>
        <span className="brand-name">Prediction × CRISP</span>
        <span className="brand-sub">poc · v0.1</span>
      </div>
      <div className="nav-tabs">
        {tabs.map((t) => {
          const on = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`nav-tab ${on ? "on" : ""}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
      <div className="top-right">
        <span className="net-pill">
          <span className="dot" />
          {activeChain.name} · {activeChain.id}
        </span>
        <ConnectWallet />
      </div>
    </div>
  );
}
