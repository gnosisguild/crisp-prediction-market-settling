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
import { LoadingCard } from "@/components/LoadingCard";
import { AttesterMint } from "@/components/AttesterMint";
import { ResolutionLadder } from "@/components/ResolutionLadder";
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

  const loading = m.isLoading;
  const canMint = !loading && m.status === MarketStatus.Created;
  // Optimistic ladder (propose→dispute→token vote→escalate) runs after trading closes, up until
  // the dispute escalates to the sealed attester layer. From escalation on, the CRISP ResolvePanel
  // takes over (committee allocation, encrypted ballots, settle).
  // Once a CRISP E3 exists (vote opened) we're at/past the attester stage — show that panel even if
  // a momentary partial read makes `escalated` read false, so the open-vote/ballot card never
  // vanishes on refresh.
  const showAttesters = m.escalated || m.winningPosition !== 0n || m.e3Id > 0n;
  const showLadder = m.status !== MarketStatus.Created && !showAttesters;

  return (
    <div className="fade-in">
      <Link href="/" className="back-link" style={{ textDecoration: "none" }}>← All markets</Link>

      <div className="detail-grid">
        <div className="detail-main">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className={`tag ${loading ? "pulse" : "live"}`}>{loading ? "Loading…" : statusLabel(m.status)}</span>
            {!loading && m.e3Id > 0n && <span className="tag">E3 #{m.e3Id.toString()}</span>}
            <span className="tag">{fmtClosesIn(m.endOfTrading, now)}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              {shortAddr(market)}
            </span>
          </div>

          {loading ? <span className="skel" style={{ width: "70%", height: 26, marginTop: 6 }} /> : <h2>{m.question}</h2>}

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
          {loading ? (
            <div style={{ padding: "16px 18px", border: "1px solid var(--rule-soft)", background: "var(--paper-2)", display: "grid", gap: 8 }}>
              <span className="skel" style={{ width: "50%", height: 12 }} />
              <span className="skel" style={{ width: "100%", height: 40 }} />
              <span className="skel" style={{ width: "100%", height: 40 }} />
            </div>
          ) : canMint ? (
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
                : "Trading is closed — resolution runs through the optimistic ladder below. Buying / minting is disabled."}
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

      {loading && <LoadingCard label="Reading resolution state…" />}

      {/* Mint a census token to join the attester pool — useful before the vote opens (the committee
          snapshots holders at openVote). Shown during resolution, while no E3 is open yet. */}
      {!loading && m.status !== MarketStatus.Created && m.status !== MarketStatus.Finalized && m.e3Id === 0n && (
        <AttesterMint />
      )}

      {showLadder && (
        <ResolutionLadder
          market={market}
          status={m.status}
          proposedOutcome={m.proposedOutcome}
          proposedAt={m.proposedAt}
          firstChallengePeriod={m.firstChallengePeriod}
          disputed={m.disputed}
          tokenVoteYes={m.tokenVoteYes}
          tokenVoteNo={m.tokenVoteNo}
          tokenVoteRecorded={m.tokenVoteRecorded}
          escalated={m.escalated}
          onChange={m.refresh}
        />
      )}

      {showAttesters && (
        <>
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
            voteOpenedAt={m.voteOpenedAt}
            inputWindowDuration={m.inputWindowDuration}
            onChange={m.refresh}
          />

          <CommitteeBallotsPanel crispProgram={ADDRESSES.crispProgram} e3Id={m.e3Id} />
        </>
      )}
    </div>
  );
}
