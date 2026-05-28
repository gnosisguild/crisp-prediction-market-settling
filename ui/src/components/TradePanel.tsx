"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, type Address } from "viem";
import { erc20Abi, marketAbi } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";
import { fmtUsdc, fmtCents, USDC_DECIMALS } from "@/lib/format";

type Side = "YES" | "NO" | "PAIR";

type Props = {
  market: Address;
  usdcBalance: bigint | undefined;
  usdcAllowance: bigint | undefined;
  yesBalance: bigint | undefined;
  noBalance: bigint | undefined;
  yesPrice: bigint;
  noPrice: bigint;
  yesReserve: bigint;
  noReserve: bigint;
  canMint: boolean;
  onChange: () => void;
};

export function TradePanel({
  market,
  usdcBalance,
  usdcAllowance,
  yesBalance,
  noBalance,
  yesPrice,
  noPrice,
  yesReserve,
  noReserve,
  canMint,
  onChange,
}: Props) {
  const { address } = useAccount();
  const client = usePublicClient();
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState("10");
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const amountBI = (() => {
    try {
      return parseUnits(amount || "0", USDC_DECIMALS);
    } catch {
      return 0n;
    }
  })();

  // Local quote (matches contract quoteBuyYes / quoteBuyNo). Avoids a round-trip.
  const sharesOut = (() => {
    if (amountBI === 0n) return 0n;
    if (yesReserve === 0n || noReserve === 0n) return 0n;
    const k = yesReserve * noReserve;
    if (side === "YES") {
      const newNo = noReserve + amountBI;
      return yesReserve + amountBI - k / newNo;
    }
    if (side === "NO") {
      const newYes = yesReserve + amountBI;
      return noReserve + amountBI - k / newYes;
    }
    return amountBI; // pair mint: 1:1
  })();

  // Effective price you're paying ≈ amount / sharesOut (only meaningful for YES/NO).
  const effPrice =
    side !== "PAIR" && sharesOut > 0n
      ? (Number(amountBI) / Number(sharesOut))
      : null;

  const needsApproval = (usdcAllowance ?? 0n) < amountBI;
  const insufficient = (usdcBalance ?? 0n) < amountBI;

  async function onFaucet() {
    if (!address) return;
    const h = await writeContractAsync({
      address: ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "mint",
      args: [address, parseUnits("1000", USDC_DECIMALS)],
    });
    setTxHash(h);
    if (client) await client.waitForTransactionReceipt({ hash: h });
    onChange();
  }

  async function onApprove() {
    const h = await writeContractAsync({
      address: ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [market, amountBI],
    });
    setTxHash(h);
    if (client) await client.waitForTransactionReceipt({ hash: h });
    onChange();
  }

  async function onBuy() {
    const fn = side === "YES" ? "buyYes" : side === "NO" ? "buyNo" : "mint";
    const h = await writeContractAsync({
      address: market,
      abi: marketAbi,
      functionName: fn,
      args: [amountBI],
    });
    setTxHash(h);
    if (client) await client.waitForTransactionReceipt({ hash: h });
    onChange();
  }

  async function onSeed() {
    const h = await writeContractAsync({
      address: market,
      abi: marketAbi,
      functionName: "seedLiquidity",
      args: [amountBI],
    });
    setTxHash(h);
    if (client) await client.waitForTransactionReceipt({ hash: h });
    onChange();
  }

  const presets = ["1", "10", "100", "1000"];

  return (
    <div>
      {/* tab strip — YES (ink), NO (amber), Pair (paper) */}
      <div className="bet-tabs" style={{ gridTemplateColumns: "1fr 1fr 1fr", display: "grid" }}>
        <button
          className={`${side === "YES" ? "on yes" : ""}`}
          onClick={() => setSide("YES")}
          style={{ borderRight: "1px solid var(--ink)" }}
        >
          YES
          <span className="ppct">{fmtCents(yesPrice)}</span>
        </button>
        <button
          className={`${side === "NO" ? "on no" : ""}`}
          onClick={() => setSide("NO")}
          style={{ borderRight: "1px solid var(--ink)" }}
        >
          NO
          <span className="ppct">{fmtCents(noPrice)}</span>
        </button>
        <button
          className={`${side === "PAIR" ? "on" : ""}`}
          onClick={() => setSide("PAIR")}
          style={{
            background: side === "PAIR" ? "var(--ink)" : "var(--paper)",
            color: side === "PAIR" ? "var(--mint)" : "var(--ink)",
          }}
        >
          Pair
          <span className="ppct">1.00</span>
        </button>
      </div>

      <div className="bet-field">
        <label>Spend</label>
        <div className="bet-input">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
          <span className="suffix">mUSDC</span>
        </div>
        <div className="preset">
          {presets.map((p) => (
            <button key={p} className={amount === p ? "on" : ""} onClick={() => setAmount(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="bet-summary">
        <div className="k">Your mUSDC</div>
        <div className="v">{fmtUsdc(usdcBalance)}</div>
        <div className="k">Your YES shares</div>
        <div className="v">{fmtUsdc(yesBalance)}</div>
        <div className="k">Your NO shares</div>
        <div className="v">{fmtUsdc(noBalance)}</div>
        {side !== "PAIR" && (
          <>
            <div className="k">Effective price</div>
            <div className="v">{effPrice !== null ? effPrice.toFixed(3) : "—"}</div>
          </>
        )}
        <div className="k">You will receive</div>
        <div className="v payout">
          {side === "PAIR"
            ? `${fmtUsdc(amountBI)} YES + ${fmtUsdc(amountBI)} NO`
            : `${fmtUsdc(sharesOut)} ${side}`}
        </div>
      </div>

      {/* If YES/NO is selected but the AMM is empty, prompt to seed first. Pair-mint
          still works with zero reserves so we don't block on that side. */}
      {(side === "YES" || side === "NO") && yesReserve === 0n && noReserve === 0n && address ? (
        <>
          <div style={{ marginTop: 14, padding: 10, background: "var(--mint-deep)", fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.55 }}>
            <b>No AMM liquidity yet.</b> Buy YES / Buy NO need a pool to swap against. Seed the pool 1:1 (you keep an implicit LP claim via the pool's residual tokens), or switch to the <b>Pair</b> tab to mint 1 YES + 1 NO at the flat price.
          </div>
          {(usdcBalance ?? 0n) < amountBI ? (
            <button className="bet-confirm" disabled style={{ background: "var(--paper)", color: "var(--muted)" }}>
              Need {fmtUsdc(amountBI)} mUSDC to seed
            </button>
          ) : needsApproval ? (
            <button className="bet-confirm yes" onClick={onApprove} disabled={isPending || confirming}>
              {isPending || confirming ? "Approving…" : `Approve ${fmtUsdc(amountBI)} mUSDC`}
            </button>
          ) : (
            <button className="bet-confirm yes" onClick={onSeed} disabled={isPending || confirming || amountBI === 0n}>
              {isPending || confirming ? "Seeding…" : `Seed ${fmtUsdc(amountBI)} mUSDC`}
            </button>
          )}
        </>
      ) : !address ? (
        <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
          Connect a wallet to trade.
        </div>
      ) : (usdcBalance ?? 0n) === 0n ? (
        <button className="bet-confirm yes" onClick={onFaucet} disabled={isPending || confirming}>
          {isPending || confirming ? "Funding…" : "Fund 1000 mUSDC from faucet"}
        </button>
      ) : !canMint ? (
        <button className="bet-confirm" style={{ background: "var(--paper)", color: "var(--muted)" }} disabled>
          Trading closed
        </button>
      ) : insufficient ? (
        <button className="bet-confirm" style={{ background: "var(--paper)", color: "var(--muted)" }} disabled>
          Insufficient mUSDC
        </button>
      ) : needsApproval ? (
        <button className={`bet-confirm ${side === "NO" ? "no" : "yes"}`} onClick={onApprove} disabled={isPending || confirming}>
          {isPending || confirming ? "Approving…" : `Approve ${fmtUsdc(amountBI)} mUSDC`}
        </button>
      ) : (
        <button
          className={`bet-confirm ${side === "NO" ? "no" : "yes"}`}
          onClick={onBuy}
          disabled={isPending || confirming || amountBI === 0n}
        >
          {isPending || confirming
            ? side === "PAIR" ? "Minting…" : `Buying ${side}…`
            : side === "PAIR"
              ? `Mint ${fmtUsdc(amountBI)} pair`
              : `Buy ${fmtUsdc(sharesOut)} ${side}`}
        </button>
      )}
    </div>
  );
}
