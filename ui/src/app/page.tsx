"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMarkets } from "@/lib/useMarkets";
import { useNow } from "@/lib/useNow";
import { fmtRel, fmtClosesIn, fmtCents, fmtPct, statusLabel } from "@/lib/format";
import { MarketStatus } from "@/lib/abis";

const ONE_18 = 10n ** 18n;
function noPriceOf(yesPrice: bigint): bigint {
  return ONE_18 > yesPrice ? ONE_18 - yesPrice : 0n;
}
function yesPctNumber(yesPrice: bigint): number {
  return (Number(yesPrice) / 1e18) * 100;
}

export default function HomePage() {
  const markets = useMarkets();
  const now = useNow();
  const [filter, setFilter] = useState<"All" | "Trading" | "Resolving" | "Finalized">("All");
  const [search, setSearch] = useState("");

  // "Resolving" = anything past trading and not yet finalized — i.e. the whole escalation ladder
  // (OpenForResolution, ResolutionProposed, DisputeRaised, TokenVote/SetByCouncil, Escalated…).
  // Bucketing only on OpenForResolution/ResolutionProposed dropped the ladder states, so markets
  // mid-dispute (where you open the E3 / vote) vanished from this view on refresh.
  const isResolving = (status: number) =>
    status !== MarketStatus.Created && status !== MarketStatus.Finalized;

  const filtered = useMemo(() => {
    // Markets come from the manager in creation order (oldest first). Show newest first, so the
    // featured card and the top of the list are the most recently created market.
    let xs = markets.slice().reverse();
    if (filter === "Trading") xs = xs.filter((m) => m.status === MarketStatus.Created);
    if (filter === "Resolving") xs = xs.filter((m) => isResolving(m.status));
    if (filter === "Finalized") xs = xs.filter((m) => m.status === MarketStatus.Finalized);
    if (search) xs = xs.filter((m) => m.question.toLowerCase().includes(search.toLowerCase()));
    return xs;
  }, [markets, filter, search]);

  const featured = filtered[0];

  const liveCount = markets.filter((m) => m.status === MarketStatus.Created).length;
  const resolvingCount = markets.filter((m) => isResolving(m.status)).length;

  return (
    <div className="fade-in">
      <div className="hero">
        <h1>
          Optimistic markets, <em>sealed-vote</em> final say.
        </h1>
        <div className="blurb">
          Resolutions are optimistic — proposed and trusted by default. Only a disputed one escalates to a CRISP attester committee, which threshold-decrypts a sealed ballot to settle it. No single oracle holds the key.
        </div>
      </div>

      <div className="metastrip">
        <div className="cell"><div className="k">Open markets</div><div className="v">{markets.length}</div></div>
        <div className="cell"><div className="k">Live trading</div><div className="v">{liveCount}</div></div>
        <div className="cell"><div className="k">In resolution</div><div className="v">{resolvingCount}</div></div>
        <div className="cell"><div className="k">Oracle</div><div className="v">CRISP</div></div>
        <div className="cell"><div className="k">Network</div><div className="v">Anvil <span className="unit">31337</span></div></div>
      </div>

      <div className="filter-bar">
        <div className="chips">
          {(["All", "Trading", "Resolving", "Finalized"] as const).map((c) => (
            <button key={c} className={`chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="search"
            placeholder="Search markets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {featured && (
        <div className="featured">
          <div className="left">
            <div className="tag-row">
              <span className="tag">Featured</span>
              <span className="tag live">{statusLabel(featured.status)}</span>
              <span className="tag">{fmtClosesIn(featured.endOfTrading, now)}</span>
              {featured.e3Id > 0n && (
                <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
                  E3 #{featured.e3Id.toString()}
                </span>
              )}
            </div>
            <Link href={`/markets/${featured.address}`} style={{ textDecoration: "none", color: "inherit" }}>
              <h2 style={{ cursor: "pointer" }}>{featured.question}</h2>
            </Link>
            <div className="prob">
              <div className="pct">{yesPctNumber(featured.yesPrice).toFixed(1)}<span className="small">% YES</span></div>
              <div className="label">Implied probability · current pool price</div>
            </div>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              <span style={{ color: "var(--live)" }}>●</span>
              {featured.e3Id > 0n
                ? `Sealed attester vote live · E3 #${featured.e3Id.toString()}`
                : "Optimistic — disputes escalate to a sealed CRISP attester vote"}
            </div>
            <Link
              href={`/markets/${featured.address}`}
              style={{ marginTop: 16, display: "inline-block", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", borderBottom: "1px solid var(--ink)", textDecoration: "none" }}
            >
              Open market — resolve / vote →
            </Link>
          </div>
          <div className="right">
            <h3>Take a position</h3>
            <div className="order-row">
              <Link href={`/markets/${featured.address}?side=YES`} className="bigbet yes">
                <div className="side">YES</div>
                <div className="price">{fmtCents(featured.yesPrice)}</div>
                <div className="hint">buys at the pool price · payout 1.00</div>
              </Link>
              <Link href={`/markets/${featured.address}?side=NO`} className="bigbet no">
                <div className="side">NO</div>
                <div className="price">{fmtCents(noPriceOf(featured.yesPrice))}</div>
                <div className="hint">buys at the pool price · payout 1.00</div>
              </Link>
            </div>
            <div style={{ marginTop: 22, fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              <div style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                How resolution works
              </div>
              At close, anyone optimistically proposes the outcome. If it&apos;s disputed it escalates — a public token vote, then a sealed CRISP attester committee that threshold-decrypts the verdict. Undisputed proposals just finalize.
            </div>
          </div>
        </div>
      )}

      <div className="section-head">
        <div>
          <div className="lbl">All markets</div>
          <h3>
            {filtered.length} {filter === "All" ? "total" : filter.toLowerCase()} markets
          </h3>
        </div>
        <div className="meta">Encrypted-vote oracle · committee shown per row</div>
      </div>

      <div className="markets">
        {markets.length === 0 && (
          <div style={{ padding: "32px 22px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
            No markets yet. Run <span className="kbd">bun run sepolia</span> to deploy, then{" "}
            <Link href="/create" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink)" }}>create one</Link>.
          </div>
        )}
        {filtered.map((m, i) => (
          <Link
            key={m.address}
            href={`/markets/${m.address}`}
            className={`market-row ${isResolving(m.status) ? "resolving" : ""}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="idx">{String(i + 1).padStart(2, "0")}</div>
            <div className="q">
              <span className="cat">{statusLabel(m.status)}</span>
              {m.question}
            </div>
            <div className="pct-cell">
              <div className="num">{fmtPct(m.yesPrice)}</div>
              <div className="bar" style={{ width: 70 }}>
                <i style={{ width: `${yesPctNumber(m.yesPrice)}%` }} />
              </div>
            </div>
            <div className="vol">
              <span className="k">E3</span>
              {m.e3Id === 0n ? "—" : `#${m.e3Id.toString()}`}
            </div>
            <div className="resolver">
              <span className="pip" />
              CRISP · binary
            </div>
            <div className="vol">
              <span className="k">Closes</span>
              {fmtRel(m.endOfTrading, now)}
            </div>
            <div className="quick">
              <span className="qbtn yes">YES {fmtCents(m.yesPrice)}</span>
              <span className="qbtn no">NO {fmtCents(noPriceOf(m.yesPrice))}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
