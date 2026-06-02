import { formatUnits } from "viem";

export const USDC_DECIMALS = 6;

export function fmtUsdc(v: bigint | undefined): string {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, USDC_DECIMALS));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(2);
}

export function fmtRel(toSec: bigint | undefined, nowSec?: number): string {
  if (toSec === undefined) return "—";
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  const dt = Number(toSec) - now;
  if (dt <= 0) return "closed";
  const m = Math.floor(dt / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/// Format a closing-time stamp as a sentence fragment. Returns "closes in 5m"
/// when in the future, "closed" when in the past. Use this for inline templates
/// — fmtRel alone returns the bare "5m" / "closed" and reads weird as
/// "closes in closed".
export function fmtClosesIn(toSec: bigint | undefined, nowSec?: number): string {
  if (toSec === undefined) return "—";
  const now = nowSec ?? Math.floor(Date.now() / 1000);
  if (Number(toSec) - now <= 0) return "closed";
  return `closes in ${fmtRel(toSec, nowSec)}`;
}

/// Format a duration (in seconds) as a compact length, e.g. "30m", "1h 5m", "2d".
export function fmtDuration(secs: bigint | number | undefined): string {
  if (secs === undefined) return "—";
  const s = Number(secs);
  if (s <= 0) return "0m";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`;
}

export function shortAddr(a: string | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/// Human label for an E3 lifecycle stage (IEnclaveMinimal.E3Stage). Shared by the
/// resolution panel, the oracle overview, and the vote page.
export function e3StageName(s: number): string {
  switch (s) {
    case 0: return "Not started";
    case 1: return "Requested";
    case 2: return "Committee finalized";
    case 3: return "Voting open";
    case 4: return "Tallying";
    case 5: return "Decrypted ✓";
    case 6: return "Failed";
    default: return "—";
  }
}

export function statusLabel(s: number | undefined): string {
  switch (s) {
    case 0: return "Created";
    case 1: return "Open for Resolution";
    case 2: return "Resolution Proposed";
    case 3: return "Dispute Raised";
    case 4: return "Token Vote";
    case 5: return "Reset by Council";
    case 6: return "Escalated to Attesters";
    case 7: return "Finalized";
    default: return "—";
  }
}

export function winnerLabel(w: bigint | undefined): "YES" | "NO" | "CANCELED" | null {
  if (w === undefined || w === 0n) return null;
  if (w === 1n) return "YES";
  if (w === 2n) return "NO";
  return "CANCELED";
}

/// Format a 1e18 fixed-point probability as cents like "0.34"
export function fmtCents(p18: bigint | undefined): string {
  if (p18 === undefined) return "—";
  return (Number(p18) / 1e18).toFixed(2);
}

/// Format a 1e18 fixed-point probability as "34%"
export function fmtPct(p18: bigint | undefined): string {
  if (p18 === undefined) return "—";
  return `${((Number(p18) / 1e18) * 100).toFixed(1)}%`;
}
