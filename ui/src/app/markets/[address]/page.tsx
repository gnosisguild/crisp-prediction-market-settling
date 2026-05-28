"use client";

import Link from "next/link";
import { use } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { useMarket } from "@/lib/useMarket";
import { useNow } from "@/lib/useNow";
import { fmtRel, fmtClosesIn, fmtUsdc, fmtPct, shortAddr, statusLabel } from "@/lib/format";
import { MarketStatus } from "@/lib/abis";
import { TradePanel } from "@/components/TradePanel";
import { ResolvePanel } from "@/components/ResolvePanel";
import { RedeemPanel } from "@/components/RedeemPanel";
import { CommitteeBallotsPanel } from "@/components/CommitteeBallotsPanel";
import { ADDRESSES } from "@/lib/addresses";

export default function MarketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: marketAddrStr } = use(params);
  const market = marketAddrStr as Address;
  const { address: account } = useAccount();
  const m = useMarket(market, account);
  const now = useNow();

  const canMint = m.status === MarketStatus.Created;

  return (
    <div className="fade-in">
      <Link href="/" className="back-link" style={{ textDecoration: "none" }}>← All markets</Link>

      <div className="detail-grid">
        <div className="detail-main">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="tag live">{statusLabel(m.status)}</span>
            {m.e3Id > 0n && <span className="tag">E3 #{m.e3Id.toString()}</span>}
            <span className="tag">{fmtClosesIn(m.endOfTrading, now)}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              {shortAddr(market)}
            </span>
          </div>

          <h2>{m.question}</h2>

          {m.additionalInfo && (
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.55 }}>
              {m.additionalInfo}
              {m.source && (
                <div style={{ marginTop: 6, color: "var(--muted)" }}>
                  source: <a href={m.source} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink)" }}>
                    {m.source}
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="detail-stats">
            <div className="cell">
              <div className="k">Trading closes</div>
              <div className="v">{fmtRel(m.endOfTrading, now)}</div>
            </div>
            <div className="cell">
              <div className="k">Resolver bond</div>
              <div className="v">{fmtUsdc(m.resolverBondAmount)} mUSDC</div>
            </div>
            <div className="cell">
              <div className="k">Challenge period</div>
              <div className="v">{(Number(m.firstChallengePeriod) / 60).toFixed(0)}m</div>
            </div>
            <div className="cell">
              <div className="k">Oracle</div>
              <div className="v">CRISP</div>
            </div>
          </div>

          <div className="chart-meta">
            <div className="left">
              <div className="pct">{fmtPct(m.yesPrice)}</div>
              <div className="lbl">implied YES</div>
            </div>
            <div className="lbl">pool: {fmtUsdc(m.yesReserve)} YES · {fmtUsdc(m.noReserve)} NO</div>
          </div>
          <div className="chart-wrap" style={{ height: 8, background: "var(--mint-deep)", border: "1px solid var(--rule-soft)", position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: `${(Number(m.yesPrice) / 1e18) * 100}%`,
                background: "var(--ink)",
              }}
            />
          </div>
        </div>

        <div className="detail-side">
          {canMint ? (
            <TradePanel
              market={market}
              usdcBalance={m.usdcBalance}
              usdcAllowance={m.usdcAllowance}
              yesBalance={m.yesBalance}
              noBalance={m.noBalance}
              yesPrice={m.yesPrice}
              noPrice={m.noPrice}
              yesReserve={m.yesReserve}
              noReserve={m.noReserve}
              canMint={canMint}
              onChange={m.refresh}
            />
          ) : (
            <div
              style={{
                padding: "16px 18px",
                border: "1px solid var(--rule-soft)",
                background: "var(--paper-2)",
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--ink-soft)",
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                Trading closed
              </div>
              {m.status === MarketStatus.Finalized
                ? "Market is finalized. Winning holders can redeem below."
                : "Awaiting CRISP committee tally. Buying / minting is disabled until the next market."}
              <div style={{ marginTop: 10, color: "var(--muted)" }}>
                Your YES: {fmtUsdc(m.yesBalance)} · NO: {fmtUsdc(m.noBalance)}
              </div>
            </div>
          )}

          <RedeemPanel
            market={market}
            status={m.status}
            winningPosition={m.winningPosition}
            yesBalance={m.yesBalance}
            noBalance={m.noBalance}
            onChange={m.refresh}
          />
        </div>
      </div>

      <ResolvePanel
        market={market}
        e3Id={m.e3Id}
        e3Stage={m.e3Stage}
        tally={m.tally}
        status={m.status}
        winningPosition={m.winningPosition}
        resolutionProposedAt={m.resolutionProposedAt}
        firstChallengePeriod={m.firstChallengePeriod}
        proposedFromCrisp={m.proposedFromCrisp}
        onChange={m.refresh}
      />

      <CommitteeBallotsPanel crispProgram={ADDRESSES.crispProgram} e3Id={m.e3Id} />
    </div>
  );
}
