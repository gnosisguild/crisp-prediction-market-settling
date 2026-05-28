"use client";

import { useChainId } from "wagmi";
import type { Address } from "viem";
import { useCommitteeBallots } from "@/lib/useCommitteeBallots";
import { shortAddr } from "@/lib/format";

function ago(blockTs: bigint): string {
  const sec = Math.floor(Date.now() / 1000) - Number(blockTs);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function explorerTxUrl(chainId: number, txHash: string): string {
  if (chainId === 11155111) return `https://sepolia.etherscan.io/tx/${txHash}`;
  if (chainId === 1) return `https://etherscan.io/tx/${txHash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  return `#${txHash}`;
}

export function CommitteeBallotsPanel({ crispProgram, e3Id }: { crispProgram: Address; e3Id: bigint }) {
  const ballots = useCommitteeBallots(crispProgram, e3Id);
  const chainId = useChainId();

  if (e3Id === 0n) return null;

  return (
    <div className="committee-panel">
      <div className="committee-head">
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            On-chain ballots · E3 #{e3Id.toString()}
          </div>
          <div className="ttl">
            Every ballot is a <em>BFV ciphertext</em>. The on-chain blob says nothing about the vote — only the threshold-decrypted tally does, and only after the committee finishes.
          </div>
        </div>
        <div className="meta">{ballots.length} submitted</div>
      </div>

      {ballots.length === 0 ? (
        <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
          No ballots yet for E3 #{e3Id.toString()}. Voters cast via{" "}
          <span className="kbd">bun run cast YES</span>.
        </div>
      ) : (
        <div className="trades" style={{ marginTop: 14, border: "1px solid var(--rule-soft)" }}>
          <div
            className="trades-head"
            style={{ gridTemplateColumns: "1.2fr 2fr 0.8fr 0.6fr" }}
          >
            <div>SUBMITTER</div>
            <div>BALLOT (encrypted)</div>
            <div>SUBMITTED</div>
            <div>TX</div>
          </div>
          {ballots.map((b) => (
            <div
              key={b.txHash}
              className="trade-row"
              style={{ gridTemplateColumns: "1.2fr 2fr 0.8fr 0.6fr" }}
            >
              <div style={{ fontFamily: "var(--mono)" }} title={b.submitter}>
                {shortAddr(b.submitter)}
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "var(--muted)",
                }}
                title={b.encryptedVote}
              >
                {b.encryptedVote.slice(0, 22)}…
              </div>
              <div style={{ fontFamily: "var(--mono)" }}>{ago(b.blockTimestamp)}</div>
              <div>
                <a
                  href={explorerTxUrl(chainId, b.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink)", textDecoration: "none", fontFamily: "var(--mono)" }}
                >
                  view →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", lineHeight: 1.55 }}>
        Click <b>view →</b> to inspect the raw transaction. The <code>publishInput</code> call carries the BFV ciphertext + Noir validity proof — no plaintext vote anywhere.
      </div>
    </div>
  );
}
