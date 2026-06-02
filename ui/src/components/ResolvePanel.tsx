"use client";

import { useState } from "react";
import Link from "next/link";
import { useWriteContract } from "wagmi";
import type { Address } from "viem";
import { adapterAbi, E3Stage, MarketStatus } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";
import { fmtRel, e3StageName, statusLabel, winnerLabel } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { E3Lifecycle } from "@/components/E3Lifecycle";

function OpenVoteButton({ market, onChange }: { market: Address; onChange: () => void }) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  async function onOpen() {
    setErr(undefined);
    setBusy(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.adapter,
        abi: adapterAbi,
        functionName: "openVote",
        args: [market],
      });
      setTimeout(onChange, 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="btn amber" onClick={onOpen} disabled={busy || isPending}>
        {busy || isPending ? "Opening vote…" : "Open CRISP vote"}
      </button>
      {err && (
        <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber-ink)" }}>{err}</div>
      )}
    </div>
  );
}

type Props = {
  market: Address;
  e3Id: bigint;
  e3Stage: number;
  tally: readonly bigint[];
  status: number;
  winningPosition: bigint;
  resolutionProposedAt: bigint;
  firstChallengePeriod: bigint;
  proposedFromCrisp: boolean;
  voteOpenedAt: bigint;
  inputWindowDuration: bigint;
  onChange: () => void;
};


export function ResolvePanel({
  market,
  e3Id,
  e3Stage,
  tally,
  status,
  winningPosition,
  resolutionProposedAt,
  firstChallengePeriod,
  proposedFromCrisp,
  voteOpenedAt,
  inputWindowDuration,
  onChange,
}: Props) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, setBusy] = useState(false);

  const yes = tally[0] ?? 0n;
  const no = tally[1] ?? 0n;
  const total = yes + no;
  const yesPct = total === 0n ? 50 : Number((yes * 1000n) / total) / 10;
  // decodeTally only returns values once the E3 is decrypted, so a 2-element tally means the
  // result is out — show it even if the on-chain stage read lags behind at CiphertextReady.
  const decrypted = e3Stage === E3Stage.Complete || tally.length >= 2;

  const finalizeAt = resolutionProposedAt + firstChallengePeriod;
  const challengeEnded = status === MarketStatus.Finalized;
  const now = useNow();
  // Real ballot cutoff: the input window end. e3Stage can lag at KeyPublished after it elapses.
  const windowEnd = voteOpenedAt + inputWindowDuration;
  const windowElapsed = voteOpenedAt > 0n && inputWindowDuration > 0n && now >= Number(windowEnd);
  const ballotsOpen = e3Stage === E3Stage.KeyPublished && !windowElapsed;

  async function onResolve() {
    setBusy(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.adapter,
        abi: adapterAbi,
        functionName: "proposeFromCRISP",
        args: [market],
      });
      setTimeout(onChange, 1500);
    } finally {
      setBusy(false);
    }
  }

  if (e3Id === 0n) {
    const escalated = status === MarketStatus.EscalatedDisputeRaised;
    return (
      <div className="committee-panel">
        <div className="committee-head">
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Sealed attester committee · CRISP
            </div>
            <div className="ttl">
              {escalated ? <>Ready to <em>open the sealed vote</em>.</> : <>Opens when a dispute <em>escalates here</em>.</>}
            </div>
          </div>
          <div className="meta">no E3 allocated yet</div>
        </div>

        {!escalated ? (
          <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
            The attester committee is allocated <b>just-in-time</b> — only once a dispute has escalated past the public token-holder vote. This avoids paying ciphernodes to babysit a committee that may never be needed.
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
              The dispute has escalated to the attester layer. Anyone can now call <span className="kbd">openVote</span> on the adapter — that allocates a fresh CRISP E3, forms the committee, and opens the <b>encrypted</b> ballot window. Unlike the token vote, attester ballots stay sealed until the threshold tally is decrypted.
            </div>
            <OpenVoteButton market={market} onChange={onChange} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="committee-panel">
      <div className="committee-head">
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            CRISP committee · E3 #{e3Id.toString()}
          </div>
          <div className="ttl">
            Sealed-vote oracle · <em>threshold tally</em>
          </div>
        </div>
        <div className="meta">stage: {e3StageName(e3Stage)}</div>
      </div>

      <E3Lifecycle
        e3Stage={e3Stage}
        voteOpenedAt={voteOpenedAt}
        inputWindowDuration={inputWindowDuration}
        now={now}
      />

      {decrypted && (
        <div className="revealed" style={{ marginTop: 18 }}>
          <div>
            <div className="lbl">Encrypted tally · revealed</div>
            <div className="outcome">
              {yesPct >= 50 ? "YES" : "NO"} · {yesPct.toFixed(1)}%
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>
              {yes.toString()} yes · {no.toString()} no
            </div>
          </div>
          <div className="right">
            <div className="lbl">Settlement</div>
            <div>
              {proposedFromCrisp ? (
                status === MarketStatus.Finalized ? (
                  <span style={{ color: "var(--live)" }}>● Finalized on-chain</span>
                ) : (
                  <span>
                    ● Proposed · finalizes in {fmtRel(finalizeAt, now)}
                  </span>
                )
              ) : (
                <button className="btn amber" onClick={onResolve} disabled={busy || isPending}>
                  {busy || isPending ? "Settling…" : "Settle on-chain"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {ballotsOpen && (
        <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          <b>Voting is open.</b> Attesters cast an encrypted ballot — proven in the browser, so the
          tally stays sealed until the committee decrypts it.
          <div style={{ marginTop: 12 }}>
            <Link href={`/markets/${market}/vote`} className="btn amber" style={{ textDecoration: "none", display: "inline-block" }}>
              Cast your sealed ballot →
            </Link>
          </div>
          <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 11 }}>
            (Headless alternative: <span className="kbd">bun run cast</span>.)
          </div>
        </div>
      )}

      {(e3Stage === E3Stage.Requested || e3Stage === E3Stage.CommitteeFinalized) && (
        <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          The committee is being allocated and generating its threshold key. Voting opens once the key is published.
        </div>
      )}

      {e3Stage === E3Stage.KeyPublished && windowElapsed && (
        <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          The voting window has closed — no more ballots can be cast. Waiting for the committee to finalize and decrypt the tally.
        </div>
      )}

      {e3Stage === E3Stage.CiphertextReady && !decrypted && (
        <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Voting is closed. The committee is threshold-decrypting the tally — it stays unreadable until enough ciphernodes decrypt.
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
        Market status: <b style={{ color: "var(--ink)" }}>{statusLabel(status)}</b>
        {winnerLabel(winningPosition) && (
          <>
            {" · "}winning side: <b style={{ color: "var(--ink)" }}>{winnerLabel(winningPosition)}</b>
          </>
        )}
        {status === MarketStatus.ResolutionProposed && !challengeEnded && (
          <>
            {" · "}finalises in <b style={{ color: "var(--ink)" }}>{fmtRel(finalizeAt, now)}</b>
          </>
        )}
      </div>
    </div>
  );
}
