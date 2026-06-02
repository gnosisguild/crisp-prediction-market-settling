"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { erc20Abi } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";

// PoC convenience: mint yourself the census token (DVT) so the CRISP server includes you in the
// next vote's attester snapshot. Equivalent to `bun run fund-voters`, but from the browser.
// Timing matters — the committee snapshots holders when the vote opens, so mint BEFORE then.

const ONE = 10n ** 18n; // DVT has 18 decimals

export function AttesterMint() {
  const { address } = useAccount();
  const { data: balance, refetch } = useReadContract({
    address: ADDRESSES.censusToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  const holds = ((balance as bigint | undefined) ?? 0n) > 0n;

  async function mint() {
    if (!address) return;
    setErr(undefined);
    setBusy(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.censusToken,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, ONE],
      });
      setTimeout(() => void refetch(), 2500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="committee-panel">
      <div className="committee-head">
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Attester eligibility
          </div>
          <div className="ttl">
            Join the <em>attester pool</em>
          </div>
        </div>
        <div className="meta">census: DVT</div>
      </div>

      {!address ? (
        <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
          Connect a wallet to join the attester pool.
        </div>
      ) : holds ? (
        <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          <span style={{ color: "var(--live)" }}>●</span> You hold a census token — you&apos;re in the
          attester pool. If a vote opens after now, you&apos;ll be eligible to cast a sealed ballot.
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55, marginBottom: 12 }}>
            Mint a census token to become an attester. The committee snapshots holders <b>when the
            vote opens</b> — mint <b>before</b>  escalating/opening the vote, or you&apos;ll only be
            eligible for the next round.
          </div>
          <button className="btn" onClick={mint} disabled={busy}>
            {busy ? "Minting…" : "Mint census token — become an attester"}
          </button>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber-ink)", wordBreak: "break-word" }}>
          {err}
        </div>
      )}
    </div>
  );
}
