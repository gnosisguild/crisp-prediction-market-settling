"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import type { Address } from "viem";
import { marketAbi, MarketStatus } from "@/lib/abis";
import { fmtRel } from "@/lib/format";
import { useNow } from "@/lib/useNow";

/// The optimistic escalation ladder (stages 1–4): propose → dispute → public token vote →
/// escalate to the sealed attester layer. Once escalated, the CRISP ResolvePanel takes over.
/// Mirrors Trueo's optimistic oracle, with the twist that the FINAL attester vote is private —
/// the public token-holder vote here is deliberately transparent to make the contrast visible.

type Props = {
  market: Address;
  status: number;
  proposedOutcome: bigint;
  proposedAt: bigint;
  firstChallengePeriod: bigint;
  disputed: boolean;
  tokenVoteYes: bigint;
  tokenVoteNo: bigint;
  tokenVoteRecorded: boolean;
  escalated: boolean;
  onChange: () => void;
};

const STAGES = ["Propose", "Dispute", "Token vote", "Escalate", "Attesters"];

function outcomeName(o: bigint): string {
  if (o === 1n) return "YES";
  if (o === 2n) return "NO";
  if (o === 3n) return "CANCELED";
  return "—";
}

/// Which ladder step is currently live (0-indexed into STAGES).
function activeStep(p: Props): number {
  if (p.escalated) return 4;
  if (p.tokenVoteRecorded) return 3;
  if (p.disputed) return 2;
  if (p.proposedOutcome !== 0n) return 1;
  return 0;
}

function useAction(onChange: () => void) {
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  async function run(fn: () => Promise<unknown>) {
    setErr(undefined);
    setBusy(true);
    try {
      await fn();
      setTimeout(onChange, 1500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }
  return { writeContractAsync, busy, err, run };
}

export function ResolutionLadder(props: Props) {
  const { market, proposedOutcome, proposedAt, firstChallengePeriod, tokenVoteYes, tokenVoteNo, onChange } = props;
  const { writeContractAsync, busy, err, run } = useAction(onChange);
  const now = useNow();
  const step = activeStep(props);

  // Editable mock token-holder tally (defaults lean NO, to contrast with a YES attester verdict).
  const [tvYes, setTvYes] = useState("30");
  const [tvNo, setTvNo] = useState("70");

  const challengeEndsAt = proposedAt + firstChallengePeriod;

  return (
    <div className="committee-panel">
      <div className="committee-head">
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Optimistic oracle · escalation ladder
          </div>
          <div className="ttl">
            Trusted by default · <em>voting only on escalation</em>
          </div>
        </div>
        <div className="meta">stage {Math.min(step + 1, STAGES.length)} / {STAGES.length}</div>
      </div>

      {/* stepper */}
      <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
        {STAGES.map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              minWidth: 88,
              padding: "8px 10px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              textAlign: "center",
              border: "1px solid var(--rule-soft)",
              background: i < step ? "var(--mint-deep)" : i === step ? "var(--ink)" : "var(--paper-2)",
              color: i === step ? "var(--paper)" : i < step ? "var(--ink)" : "var(--muted)",
            }}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {/* Stage 1 — propose */}
      {step === 0 && props.status === MarketStatus.OpenForResolution && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            Trading has closed. Anyone can optimistically <b>propose an outcome</b> by posting a bond
            (<span className="kbd">$250</span>, narrated in this PoC). If nobody disputes within the
            challenge window, that outcome stands — no committee, no vote.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => writeContractAsync({ address: market, abi: marketAbi, functionName: "proposeOutcome", args: [1n] }))}
            >
              Propose YES
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => writeContractAsync({ address: market, abi: marketAbi, functionName: "proposeOutcome", args: [2n] }))}
            >
              Propose NO
            </button>
          </div>
        </div>
      )}

      {/* Stage 2 — dispute */}
      {step === 1 && (
        <div style={{ marginTop: 18 }}>
          <div className="revealed" style={{ marginBottom: 14 }}>
            <div>
              <div className="lbl">Optimistic proposal</div>
              <div className="outcome">{outcomeName(proposedOutcome)}</div>
            </div>
            <div className="right">
              <div className="lbl">Challenge window</div>
              <div>{now < Number(challengeEndsAt) ? `closes in ${fmtRel(challengeEndsAt, now)}` : "elapsed"}</div>
            </div>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            Disagree with the proposed outcome? <b>Dispute</b> it by matching the bond
            (<span className="kbd">$250</span>). That kicks resolution into the public token-holder vote.
          </div>
          <button
            className="btn amber"
            disabled={busy}
            onClick={() => run(() => writeContractAsync({ address: market, abi: marketAbi, functionName: "dispute", args: [] }))}
          >
            {busy ? "Disputing…" : "Dispute the proposal"}
          </button>
        </div>
      )}

      {/* Stage 3 — public (mock) token-holder vote */}
      {step === 2 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            <b>Token-holder vote</b> — the financialized layer. Token-weighted and <b>fully public</b>:
            every ballot and the running tally are visible on-chain. This is the layer we are
            <em> not</em> trying to make private — capital, not secrecy, is its trust model.
            <div style={{ marginTop: 8, color: "var(--muted)" }}>
              (Mocked here — record a public tally to simulate the vote outcome.)
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              YES weight
              <input value={tvYes} onChange={(e) => setTvYes(e.target.value)} inputMode="numeric"
                style={{ display: "block", marginTop: 4, width: 90, padding: "6px 8px", fontFamily: "var(--mono)" }} />
            </label>
            <label style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
              NO weight
              <input value={tvNo} onChange={(e) => setTvNo(e.target.value)} inputMode="numeric"
                style={{ display: "block", marginTop: 4, width: 90, padding: "6px 8px", fontFamily: "var(--mono)" }} />
            </label>
            <button
              className="btn"
              disabled={busy}
              onClick={() => run(() => writeContractAsync({
                address: market, abi: marketAbi, functionName: "recordTokenVote",
                args: [BigInt(tvYes || "0"), BigInt(tvNo || "0")],
              }))}
            >
              {busy ? "Recording…" : "Record public token vote"}
            </button>
          </div>
        </div>
      )}

      {/* Stage 4 — escalate to attesters */}
      {step === 3 && (
        <div style={{ marginTop: 18 }}>
          <div className="revealed" style={{ marginBottom: 14 }}>
            <div>
              <div className="lbl">Token vote · public tally</div>
              <div className="outcome">{tokenVoteYes >= tokenVoteNo ? "YES" : "NO"}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>
                {tokenVoteYes.toString()} yes · {tokenVoteNo.toString()} no — visible to everyone
              </div>
            </div>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 14 }}>
            Still unhappy? <b>Escalate to the attester layer</b> — the un-financialized, reputation-based
            committee. This is where privacy matters most: identity-based voters are the ones exposed to
            bribery and social pressure, so their ballots are <b>sealed</b> via a CRISP encrypted vote.
            Escalating is what allocates the committee — just-in-time, not before.
          </div>
          <button
            className="btn amber"
            disabled={busy}
            onClick={() => run(() => writeContractAsync({ address: market, abi: marketAbi, functionName: "escalateToAttesters", args: [] }))}
          >
            {busy ? "Escalating…" : "Escalate to attesters →"}
          </button>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber-ink)", wordBreak: "break-word" }}>
          {err}
        </div>
      )}
    </div>
  );
}
