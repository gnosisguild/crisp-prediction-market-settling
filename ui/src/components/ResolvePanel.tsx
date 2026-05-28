"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import type { Address } from "viem";
import { adapterAbi, E3Stage, MarketStatus } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";
import { fmtRel, statusLabel, winnerLabel } from "@/lib/format";
import { useNow } from "@/lib/useNow";

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
  onChange: () => void;
};

function stageName(s: number): string {
  switch (s) {
    case E3Stage.None: return "Not started";
    case E3Stage.Requested: return "Requested";
    case E3Stage.CommitteeFinalized: return "Committee finalized";
    case E3Stage.KeyPublished: return "Voting open";
    case E3Stage.CiphertextReady: return "Tallying";
    case E3Stage.Complete: return "Decrypted ✓";
    case E3Stage.Failed: return "Failed";
    default: return "—";
  }
}

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
  onChange,
}: Props) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, setBusy] = useState(false);

  const yes = tally[0] ?? 0n;
  const no = tally[1] ?? 0n;
  const total = yes + no;
  const yesPct = total === 0n ? 50 : Number((yes * 1000n) / total) / 10;

  const finalizeAt = resolutionProposedAt + firstChallengePeriod;
  const challengeEnded = status === MarketStatus.Finalized;
  const now = useNow();

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
    const tradingClosed = status !== MarketStatus.Created;
    return (
      <div className="committee-panel">
        <div className="committee-head">
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              CRISP committee
            </div>
            <div className="ttl">
              {tradingClosed ? <>Ready to <em>open the vote</em>.</> : <>Vote opens when <em>trading closes</em>.</>}
            </div>
          </div>
          <div className="meta">no E3 allocated yet</div>
        </div>

        {!tradingClosed ? (
          <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
            A CRISP committee will be allocated at the moment trading closes — not before. This avoids paying ciphernodes to babysit a vote that hasn&apos;t started.
          </div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
              Trading has closed. Anyone can now call <span className="kbd">openVote</span> on the adapter — that allocates a fresh CRISP E3 with a monotonic id, forms the committee, and opens the encrypted ballot window.
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
        <div className="meta">stage: {stageName(e3Stage)}</div>
      </div>

      <div className="oracle-progress" style={{ marginTop: 18 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Threshold decryption progress
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: e3Stage >= E3Stage.Complete ? "100%" : e3Stage >= E3Stage.CiphertextReady ? "70%" : e3Stage >= E3Stage.KeyPublished ? "35%" : "8%" }}
          />
          <div className="threshold-mark" style={{ left: "67%" }} />
        </div>
        <div className="progress-meta">
          <span>{e3Stage >= E3Stage.Complete ? "decrypted" : "ciphertext"} ·</span>
          <span>threshold reached: {e3Stage >= E3Stage.Complete ? "yes" : "no"}</span>
        </div>
      </div>

      {e3Stage === E3Stage.Complete && (
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

      {e3Stage < E3Stage.Complete && (
        <div style={{ marginTop: 16, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          The committee is still tallying encrypted ballots. The on-chain tally is unreadable until the threshold of ciphernodes decrypts.
          <div style={{ marginTop: 8, color: "var(--muted)" }}>
            Run the voter CLI to cast encrypted ballots, then mark the E3 complete via the mock-oracle controls.
          </div>
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
