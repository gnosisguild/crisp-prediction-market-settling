"use client";

import Link from "next/link";
import { useMarkets } from "@/lib/useMarkets";
import { useReadContracts } from "wagmi";
import { crispProgramAbi, enclaveAbi, E3Stage } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";
import { fmtRel, statusLabel } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useMemo } from "react";

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

export default function OraclePage() {
  const markets = useMarkets();
  const now = useNow();
  const linked = useMemo(() => markets.filter((m) => m.e3Id > 0n), [markets]);

  const { data } = useReadContracts({
    contracts: linked.flatMap((m) => [
      { address: ADDRESSES.enclave, abi: enclaveAbi, functionName: "getE3Stage", args: [m.e3Id] },
      { address: ADDRESSES.crispProgram, abi: crispProgramAbi, functionName: "decodeTally", args: [m.e3Id] },
    ]),
    query: { enabled: linked.length > 0 },
  });

  return (
    <div className="fade-in">
      <div className="hero">
        <h1>
          Oracle overview · <em>CRISP committee</em> state.
        </h1>
        <div className="blurb">
          Every market is bound to one E3 (encrypted execution environment). This page shows the live committee stage for each binding — voters cast encrypted ballots; once decrypted, anyone can settle the linked market.
        </div>
      </div>

      <div className="metastrip">
        <div className="cell"><div className="k">Bindings</div><div className="v">{linked.length}</div></div>
        <div className="cell">
          <div className="k">Voting open</div>
          <div className="v">
            {data ? linked.filter((_, i) => Number(data[i * 2]?.result) === E3Stage.KeyPublished).length : 0}
          </div>
        </div>
        <div className="cell">
          <div className="k">Tallying</div>
          <div className="v">
            {data ? linked.filter((_, i) => Number(data[i * 2]?.result) === E3Stage.CiphertextReady).length : 0}
          </div>
        </div>
        <div className="cell">
          <div className="k">Decrypted</div>
          <div className="v">
            {data ? linked.filter((_, i) => Number(data[i * 2]?.result) === E3Stage.Complete).length : 0}
          </div>
        </div>
        <div className="cell">
          <div className="k">Oracle contract</div>
          <div className="v" style={{ fontSize: 11 }}>{ADDRESSES.crispProgram.slice(0, 10)}…</div>
        </div>
      </div>

      <div className="section-head">
        <div>
          <div className="lbl">E3 bindings</div>
          <h3>{linked.length} markets linked to CRISP votes</h3>
        </div>
        <div className="meta">click a row to manage the market</div>
      </div>

      <div className="markets">
        {linked.length === 0 && (
          <div style={{ padding: "32px 22px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>
            No markets are bound to a CRISP E3 yet. Use the <Link href="/create" style={{ color: "var(--ink)", borderBottom: "1px solid var(--ink)" }}>create</Link> page to spin up a market with an E3 binding.
          </div>
        )}
        {linked.map((m, i) => {
          const stage = Number(data?.[i * 2]?.result ?? 0);
          const tally = (data?.[i * 2 + 1]?.result as readonly bigint[] | undefined) ?? [];
          const yes = tally[0] ?? 0n;
          const no = tally[1] ?? 0n;
          const total = yes + no;
          const yesPct = total === 0n ? null : Number((yes * 1000n) / total) / 10;
          return (
            <Link
              key={m.address}
              href={`/markets/${m.address}`}
              className="market-row"
              style={{ textDecoration: "none", color: "inherit", gridTemplateColumns: "56px 1fr 130px 160px 160px 110px 200px" }}
            >
              <div className="idx">E3 #{m.e3Id.toString().padStart(2, "0")}</div>
              <div className="q">
                <span className="cat">{statusLabel(m.status)}</span>
                {m.question}
              </div>
              <div className="resolver">
                <span className={`pip${stage === E3Stage.Complete ? "" : stage === E3Stage.None ? " off" : ""}`} />
                {stageName(stage)}
              </div>
              <div className="vol">
                <span className="k">Encrypted tally</span>
                {stage >= E3Stage.Complete ? `${yes.toString()} YES · ${no.toString()} NO` : "sealed"}
              </div>
              <div className="vol">
                <span className="k">Implied</span>
                {yesPct === null ? "—" : `${yesPct.toFixed(1)}% YES`}
              </div>
              <div className="vol">
                <span className="k">Closes</span>
                {fmtRel(m.endOfTrading, now)}
              </div>
              <div className="quick">
                <span className="qbtn">manage →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
