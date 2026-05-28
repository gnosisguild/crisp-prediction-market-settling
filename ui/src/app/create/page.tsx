"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { decodeEventLog, parseUnits, type Address } from "viem";
import { managerAbi, marketAbi, erc20Abi } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";
import { USDC_DECIMALS } from "@/lib/format";

const INITIAL_LIQUIDITY = parseUnits("100", USDC_DECIMALS); // 100 mUSDC seeded into the AMM

const presets = [
  { label: "1 minute",   sec: 60 },
  { label: "2 minutes",  sec: 2 * 60 },
  { label: "5 minutes",  sec: 5 * 60 },
  { label: "30 minutes", sec: 30 * 60 },
  { label: "1 hour",     sec: 60 * 60 },
  { label: "1 day",      sec: 24 * 60 * 60 },
];

export default function CreateMarketPage() {
  const router = useRouter();
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [question, setQuestion] = useState("Will testcase pass on first try?");
  const [source, setSource] = useState("https://github.com/example/repo");
  const [info, setInfo] = useState("Resolved by an encrypted CRISP committee vote at close.");
  const [duration, setDuration] = useState(2 * 60);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("Creating…");
  const [err, setErr] = useState<string | undefined>();

  async function onCreate() {
    if (!client || !address) return;
    setErr(undefined);
    setBusy(true);
    try {
      // ---- 1. createMarket ----
      setBusyMsg("Creating market…");
      const endOfTrading = BigInt(Math.floor(Date.now() / 1000) + duration);
      const hash = await writeContractAsync({
        address: ADDRESSES.manager,
        abi: managerAbi,
        functionName: "createMarket",
        args: [
          question,
          source,
          info,
          endOfTrading,
          0n,
          "0x0000000000000000000000000000000000000000",
          0n,
          "YES",
          "NO",
        ],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });

      let created: Address | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== ADDRESSES.manager.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: managerAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === "MarketCreated") {
            created = decoded.args.market as Address;
            break;
          }
        } catch {
          // ignore non-matching logs
        }
      }

      if (!created) {
        throw new Error("market created but address could not be parsed from event log");
      }

      // ---- 2. seed AMM liquidity so buyYes/buyNo work right away ----
      // Fund the creator with mUSDC if needed (MockUSDC.mint is permissionless),
      // approve the new market, call seedLiquidity. Skip silently if anything trips —
      // user can still mint pairs / seed manually from the detail page later.
      try {
        const bal = (await client.readContract({
          address: ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (bal < INITIAL_LIQUIDITY) {
          setBusyMsg("Minting mUSDC…");
          const mintHash = await writeContractAsync({
            address: ADDRESSES.usdc,
            abi: erc20Abi,
            functionName: "mint",
            args: [address, INITIAL_LIQUIDITY],
          });
          await client.waitForTransactionReceipt({ hash: mintHash });
        }

        setBusyMsg("Approving market…");
        const approveHash = await writeContractAsync({
          address: ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [created, INITIAL_LIQUIDITY],
        });
        await client.waitForTransactionReceipt({ hash: approveHash });

        setBusyMsg("Seeding liquidity…");
        const seedHash = await writeContractAsync({
          address: created,
          abi: marketAbi,
          functionName: "seedLiquidity",
          args: [INITIAL_LIQUIDITY],
        });
        await client.waitForTransactionReceipt({ hash: seedHash });
      } catch (seedErr) {
        console.warn("auto-seed failed; market created without AMM liquidity", seedErr);
        // Don't block — fall through to navigate.
      }

      // Write MARKET= back to repo-root .env so bun orchestrators pick it up.
      // Fails silently — UI navigation must not depend on it.
      void fetch("/api/set-market", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market: created }),
      }).catch(() => {});

      router.push(`/markets/${created}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusyMsg("Creating…");
    }
  }

  return (
    <div className="fade-in">
      <div className="hero">
        <h1>
          Create a market resolved by <em>encrypted vote</em>.
        </h1>
        <div className="blurb">
          Spin up a binary market. Once trading closes, anyone opens the CRISP vote — that&apos;s the moment a committee is allocated, not before. After voters cast encrypted ballots and the tally is decrypted, anyone settles the market on-chain.
        </div>
      </div>

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 0, border: "1px solid var(--ink)", background: "var(--paper)" }}>
        <div style={{ padding: 26, borderRight: "1px solid var(--ink)" }}>
          <div className="bet-field">
            <label>Question</label>
            <div className="bet-input">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} style={{ fontSize: 16 }} />
            </div>
          </div>

          <div className="bet-field">
            <label>Source URL</label>
            <div className="bet-input">
              <input value={source} onChange={(e) => setSource(e.target.value)} style={{ fontSize: 14 }} />
            </div>
          </div>

          <div className="bet-field">
            <label>Additional info</label>
            <div className="bet-input">
              <input value={info} onChange={(e) => setInfo(e.target.value)} style={{ fontSize: 14 }} />
            </div>
          </div>

          <div className="bet-field">
            <label>Trading window</label>
            <div className="preset">
              {presets.map((p) => (
                <button key={p.sec} className={duration === p.sec ? "on" : ""} onClick={() => setDuration(p.sec)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: 26, background: "var(--paper-2)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            CRISP oracle binding
          </div>
          <h3 style={{ marginTop: 6, fontWeight: 500 }}>Just-in-time</h3>

          <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>
              <span style={{ color: "var(--muted)" }}>now</span> &nbsp;&nbsp;&nbsp; trading opens · users mint YES + NO pairs
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <span style={{ color: "var(--muted)" }}>+ {Math.round(duration / 60)} min</span> &nbsp;&nbsp;&nbsp; trading closes — anyone calls <span className="kbd">openVote</span>
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <span style={{ color: "var(--muted)" }}>+ voting</span> &nbsp;&nbsp;&nbsp; CRISP committee tallies encrypted ballots
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <span style={{ color: "var(--muted)" }}>+ decrypt</span> &nbsp;&nbsp;&nbsp; anyone calls <span className="kbd">proposeFromCRISP</span>
            </p>
            <p style={{ margin: "8px 0 0" }}>
              <span style={{ color: "var(--muted)" }}>+ challenge</span> &nbsp;&nbsp;&nbsp; market finalises · winners redeem
            </p>
          </div>

          <div style={{ marginTop: 18, padding: 12, background: "var(--mint-deep)", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.55 }}>
            <div style={{ color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Why JIT</div>
            A CRISP committee allocates real ciphernode resources. Spinning it up at market creation would force them to babysit for the whole trading window. JIT allocation only spends those resources when voting actually needs to happen.
          </div>

          {!address ? (
            <div style={{ marginTop: 18, fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
              Connect a wallet to create a market.
            </div>
          ) : (
            <button className="bet-confirm yes" style={{ marginTop: 18 }} onClick={onCreate} disabled={busy || isPending}>
              {busy || isPending ? busyMsg : "Create market"}
            </button>
          )}

          {err && (
            <div style={{ marginTop: 12, fontFamily: "var(--mono)", fontSize: 11, color: "var(--amber-ink)", wordBreak: "break-word" }}>
              {err}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
