"use client";

import { useState } from "react";
import { useWriteContract } from "wagmi";
import type { Address } from "viem";
import { marketAbi, MarketStatus } from "@/lib/abis";
import { fmtUsdc, winnerLabel } from "@/lib/format";

type Props = {
  market: Address;
  status: number;
  winningPosition: bigint;
  yesBalance: bigint | undefined;
  noBalance: bigint | undefined;
  onChange: () => void;
};

export function RedeemPanel({ market, status, winningPosition, yesBalance, noBalance, onChange }: Props) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [busy, setBusy] = useState(false);

  if (status !== MarketStatus.Finalized) return null;

  const winner = winnerLabel(winningPosition);
  let payout: bigint = 0n;
  if (winner === "YES") payout = yesBalance ?? 0n;
  else if (winner === "NO") payout = noBalance ?? 0n;
  else if (winner === "CANCELED") {
    const y = yesBalance ?? 0n;
    const n = noBalance ?? 0n;
    payout = y < n ? y : n;
  }

  async function onRedeem() {
    setBusy(true);
    try {
      await writeContractAsync({
        address: market,
        abi: marketAbi,
        functionName: "redeemAll",
      });
      setTimeout(onChange, 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="revealed" style={{ marginTop: 18, background: payout > 0n ? "var(--mint-deep)" : "var(--paper)" }}>
      <div>
        <div className="lbl">Settled · {winner}</div>
        <div className="outcome">{payout > 0n ? `+ ${fmtUsdc(payout)} mUSDC` : "no winning shares"}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>
          your YES: {fmtUsdc(yesBalance)} · your NO: {fmtUsdc(noBalance)}
        </div>
      </div>
      <div className="right">
        {payout > 0n ? (
          <button className="btn" onClick={onRedeem} disabled={busy || isPending}>
            {busy || isPending ? "Redeeming…" : "Redeem"}
          </button>
        ) : (
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>nothing to redeem</span>
        )}
      </div>
    </div>
  );
}
