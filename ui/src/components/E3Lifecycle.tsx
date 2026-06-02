"use client";

import { E3Stage } from "@/lib/abis";
import { fmtDuration, fmtClosesIn } from "@/lib/format";

// The real E3 lifecycle, in order. Shown with done / active / pending state so the UI reflects
// what the committee is actually doing right now (forming, DKG, voting open, decrypting, done) —
// shared by the resolution panel and the attester vote page.
const E3_STEPS: { stage: number; label: string; desc: string }[] = [
  { stage: E3Stage.Requested,          label: "E3 requested",      desc: "ciphernode committee being selected" },
  { stage: E3Stage.CommitteeFinalized, label: "Committee finalized", desc: "running distributed key generation (DKG)" },
  { stage: E3Stage.KeyPublished,       label: "Key published · voting open", desc: "attesters cast encrypted ballots" },
  { stage: E3Stage.CiphertextReady,    label: "Voting closed",     desc: "committee threshold-decrypting the tally" },
  { stage: E3Stage.Complete,           label: "Tally decrypted",   desc: "outcome revealed on-chain" },
];

type Props = {
  e3Stage: number;
  // Optional voting-window summary. Pass all three to render "Voting window: 30m · ballots close in 12m".
  voteOpenedAt?: bigint;
  inputWindowDuration?: bigint;
  now?: number;
};

export function E3Lifecycle({ e3Stage, voteOpenedAt, inputWindowDuration, now }: Props) {
  const windowEnd = (voteOpenedAt ?? 0n) + (inputWindowDuration ?? 0n);
  const showWindow = (voteOpenedAt ?? 0n) > 0n && (inputWindowDuration ?? 0n) > 0n;
  const windowElapsed = showWindow && (now ?? 0) >= Number(windowEnd);
  // The on-chain stage lags: it stays at KeyPublished until the E3 is nudged to CiphertextReady.
  // Once the input window's time is up, advance the *displayed* step to "Voting closed" so the
  // stepper matches the "ballots closed" state instead of still saying "voting open".
  const displayStage =
    e3Stage === E3Stage.KeyPublished && windowElapsed ? E3Stage.CiphertextReady : e3Stage;

  return (
    <div className="oracle-progress" style={{ marginTop: 18 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        E3 lifecycle
      </div>
      {e3Stage === E3Stage.Failed ? (
        <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 12, color: "var(--amber-ink)" }}>
          ✗ E3 failed — the committee aborted. A new vote must be opened.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {E3_STEPS.map((s) => {
            const done = displayStage > s.stage;
            const active = displayStage === s.stage;
            const mark = done ? "●" : active ? "◉" : "○";
            const color = done ? "var(--live)" : active ? "var(--ink)" : "var(--muted)";
            return (
              <div key={s.stage} style={{ display: "flex", gap: 10, alignItems: "baseline", fontFamily: "var(--mono)", fontSize: 12 }}>
                <span style={{ color }}>{mark}</span>
                <span style={{ color, fontWeight: active ? 600 : 400 }}>{s.label}</span>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>
                  {s.desc}{active ? " — now" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {showWindow && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--rule-soft)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>
          Voting window: <b style={{ color: "var(--ink)" }}>{fmtDuration(inputWindowDuration)}</b>
          {" · "}
          {displayStage <= E3Stage.KeyPublished && !windowElapsed
            ? <>ballots {fmtClosesIn(windowEnd, now)}</>
            : <>ballots closed</>}
        </div>
      )}
    </div>
  );
}
