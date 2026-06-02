"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import { hashMessage, type Address, type Hex } from "viem";
import { useMarket } from "@/lib/useMarket";
import { useNow } from "@/lib/useNow";
import { E3Stage } from "@/lib/abis";
import { shortAddr, fmtDuration, fmtClosesIn } from "@/lib/format";
import { E3Lifecycle } from "@/components/E3Lifecycle";
import { AttesterMint } from "@/components/AttesterMint";

// In-browser attester ballot. Mirrors voter-cli/src/realVote.ts, but signs with the connected
// wallet and proves locally in the browser — the cleartext YES/NO is encrypted here and never
// leaves the page. The server only ever proxies the sealed proof (see /api/crisp/*).

type Phase =
  | "idle"
  | "signing"
  | "census"
  | "proving"
  | "broadcasting"
  | "done"
  | "error";
type Mode = "vote" | "mask";

function phaseLabel(phase: Phase, mode: Mode): string {
  switch (phase) {
    case "signing":
      return "Sign the ballot in your wallet…";
    case "census":
      return mode === "mask"
        ? "Fetching your ballot + census…"
        : "Fetching the committee key + census…";
    case "proving":
      return mode === "mask"
        ? "Re-randomizing + proving in your browser…"
        : "Encrypting + proving in your browser…";
    case "broadcasting":
      return mode === "mask"
        ? "Broadcasting the masked ballot…"
        : "Broadcasting the sealed ballot…";
    default:
      return "";
  }
}

export default function AttesterVotePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: marketAddrStr } = use(params);
  const market = marketAddrStr as Address;
  const { address: account } = useAccount();
  const m = useMarket(market, account);
  const { signMessageAsync } = useSignMessage();

  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("vote");
  const [maskedSlot, setMaskedSlot] = useState<string | undefined>();
  const [err, setErr] = useState<string | undefined>();
  const [txHash, setTxHash] = useState<Hex | undefined>();

  const now = useNow();
  const windowEnd = m.voteOpenedAt + m.inputWindowDuration;
  // The on-chain e3Stage can still read KeyPublished after the input window has actually elapsed
  // (the stage only advances to CiphertextReady once triggered). Treat the window's end time as the
  // real cutoff so we don't offer a ballot that would be rejected.
  const windowKnown = m.voteOpenedAt > 0n && m.inputWindowDuration > 0n;
  const windowElapsed = windowKnown && now >= Number(windowEnd);
  const votingOpen =
    m.escalated && m.e3Id > 0n && m.e3Stage === E3Stage.KeyPublished && !windowElapsed;

  async function fetchRound(e3Id: bigint) {
    const roundResp = await fetch("/api/crisp/round", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ e3Id: e3Id.toString() }),
    });
    const round = (await roundResp.json()) as {
      publicKey?: number[];
      leaves?: string[];
      error?: string;
    };
    if (!roundResp.ok || !round.publicKey || !round.leaves) {
      throw new Error(round.error ?? "failed to fetch round data");
    }
    return round as { publicKey: number[]; leaves: string[] };
  }

  async function broadcast(e3Id: bigint, encoded: Hex) {
    const bResp = await fetch("/api/crisp/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        round_id: Number(e3Id),
        encoded_proof: encoded,
        address: account,
      }),
    });
    const body = (await bResp.json()) as {
      status?: string;
      tx_hash?: Hex;
      message?: string;
      error?: string;
    };
    if (!bResp.ok || (body.status !== "success" && body.status !== "Success")) {
      throw new Error(body.error ?? body.message ?? "broadcast failed");
    }
    return body.tx_hash;
  }

  // Shared pipeline for casting a vote and masking a ballot. A mask targets a RANDOM eligible
  // voter's slot (not necessarily your own) and re-randomizes it — same underlying vote, fresh
  // ciphertext (or a zero decoy if that slot is empty). That cover traffic is what makes the
  // attester layer coercion-resistant: nobody can prove who changed which ballot. Neither path
  // reveals a choice to our server; proving happens here in the browser.
  async function submit(submitMode: Mode) {
    if (!account) return;
    setErr(undefined);
    setTxHash(undefined);
    setMaskedSlot(undefined);
    setMode(submitMode);
    try {
      const e3Id = m.e3Id;

      let signature: Hex | undefined;
      let messageHash: Hex | undefined;
      if (submitMode === "vote") {
        setPhase("signing");
        const message = `Vote for round ${e3Id}`;
        signature = (await signMessageAsync({ message })) as Hex;
        messageHash = hashMessage(message);
      }

      setPhase("census");
      const round = await fetchRound(e3Id);

      // Mask params: pick a random census slot and fetch its current ciphertext to re-randomize.
      let slotAddress = account as string;
      let slotBalance = 1n;
      let previousCiphertext: Uint8Array | undefined;
      if (submitMode === "mask") {
        const evResp = await fetch("/api/crisp/eligible-voters", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ e3Id: e3Id.toString() }),
        });
        const ev = (await evResp.json()) as {
          voters?: { address: string; balance: number }[];
          error?: string;
        };
        if (!evResp.ok || !ev.voters || ev.voters.length === 0) {
          throw new Error(ev.error ?? "no eligible voters available to mask");
        }
        const idx =
          crypto.getRandomValues(new Uint32Array(1))[0] % ev.voters.length;
        const voter = ev.voters[idx];
        slotAddress = voter.address;
        slotBalance = BigInt(voter.balance);
        setMaskedSlot(voter.address);

        const pcResp = await fetch("/api/crisp/previous-ciphertext", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ e3Id: e3Id.toString(), address: slotAddress }),
        });
        const pc = (await pcResp.json()) as {
          ciphertext?: number[] | null;
          error?: string;
        };
        if (!pcResp.ok)
          throw new Error(pc.error ?? "failed to fetch ballot ciphertext");
        previousCiphertext = pc.ciphertext
          ? new Uint8Array(pc.ciphertext)
          : undefined;
      }

      setPhase("proving");
      // Lazy-load the heavy SDK (bb.js WASM + Noir) only on submit — keeps it out of SSR / first load.
      const { generateVoteProof, generateMaskVoteProof, encodeSolidityProof } =
        await import("@crisp-e3/sdk");
      const publicKey = new Uint8Array(round.publicKey);
      const merkleLeaves = round.leaves.map((s) => BigInt(s));
      let proof;
      try {
        proof =
          submitMode === "vote"
            ? await generateVoteProof({
                publicKey,
                balance: 1n,
                slotAddress: account,
                merkleLeaves,
                vote: side === "YES" ? [1, 0] : [0, 1],
                signature: signature!,
                messageHash: messageHash!,
              })
            : await generateMaskVoteProof({
                publicKey,
                balance: slotBalance,
                slotAddress,
                merkleLeaves,
                previousCiphertext,
                numOptions: 2,
              });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Leaf not found in the tree")) {
          throw new Error(
            `Your address (${account}) is not in the CRISP census for this round. ` +
              `Only census-token holders snapshotted at openVote time can vote.`,
          );
        }
        throw e;
      }
      const encoded = encodeSolidityProof(proof);

      setPhase("broadcasting");
      const hash = await broadcast(e3Id, encoded);

      setTxHash(hash);
      setPhase("done");
      setTimeout(m.refresh, 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  const busy =
    phase === "signing" ||
    phase === "census" ||
    phase === "proving" ||
    phase === "broadcasting";

  return (
    <div className="fade-in">
      <Link
        href={`/markets/${market}`}
        className="back-link"
        style={{ textDecoration: "none" }}
      >
        ← Back to market
      </Link>

      <div className="committee-panel" style={{ marginTop: 16 }}>
        <div className="committee-head">
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Sealed attester ballot · CRISP{" "}
              {m.e3Id > 0n ? `· E3 #${m.e3Id.toString()}` : ""}
            </div>
            <div className="ttl">
              Cast an <em>encrypted</em> vote
            </div>
          </div>
          <div className="meta">{shortAddr(market)}</div>
        </div>

        <h2 style={{ marginTop: 14 }}>{m.question || "…"}</h2>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--mint-deep)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-soft)",
            lineHeight: 1.55,
          }}
        >
          Your ballot is BFV-encrypted and proven <b>in this browser</b> —
          nobody, not even this app&apos;s server, learns how you voted. It is
          unlinkable to your YES/NO, which is exactly what makes the attester
          layer coercion-resistant (unlike the public token vote earlier).
        </div>

        {/* gating */}
        {!account ? (
          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            Connect a wallet (a census-token holder) to cast a ballot.
          </div>
        ) : !m.escalated || m.e3Id === 0n ? (
          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--ink-soft)",
            }}
          >
            No sealed vote is open yet. A dispute must escalate to the attester
            layer and the committee must be opened first.{" "}
            <Link
              href={`/markets/${market}`}
              style={{
                color: "var(--ink)",
                borderBottom: "1px solid var(--ink)",
              }}
            >
              Go to the market →
            </Link>
          </div>
        ) : m.e3Stage < E3Stage.KeyPublished ? (
          <>
            <div
              style={{
                marginTop: 16,
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              The committee is still forming (publishing its key). Voting opens
              once the key is published — check back shortly.
            </div>
            <E3Lifecycle
              e3Stage={m.e3Stage}
              voteOpenedAt={m.voteOpenedAt}
              inputWindowDuration={m.inputWindowDuration}
              now={now}
            />
          </>
        ) : !votingOpen ? (
          <>
            <div
              style={{
                marginTop: 16,
                fontFamily: "var(--mono)",
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              {m.e3Stage > E3Stage.KeyPublished
                ? "Voting is closed — the committee is threshold-decrypting the tally. You can no longer cast a ballot."
                : "The voting window has closed — no more ballots can be cast. Waiting for the committee to finalize and decrypt the tally."}
            </div>
            <E3Lifecycle
              e3Stage={m.e3Stage}
              voteOpenedAt={m.voteOpenedAt}
              inputWindowDuration={m.inputWindowDuration}
              now={now}
            />
          </>
        ) : (
          <div style={{ marginTop: 18 }}>
            {m.voteOpenedAt > 0n && m.inputWindowDuration > 0n && (
              <div
                style={{
                  marginBottom: 14,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                Voting window:{" "}
                <b style={{ color: "var(--ink)" }}>
                  {fmtDuration(m.inputWindowDuration)}
                </b>
                {" · ballots "}
                <b style={{ color: "var(--ink)" }}>
                  {fmtClosesIn(windowEnd, now)}
                </b>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className={side === "YES" ? "btn on" : "btn"}
                onClick={() => setSide("YES")}
                disabled={busy}
                style={
                  side === "YES"
                    ? { background: "var(--ink)", color: "var(--paper)" }
                    : undefined
                }
              >
                Vote YES
              </button>
              <button
                className={side === "NO" ? "btn on" : "btn"}
                onClick={() => setSide("NO")}
                disabled={busy}
                style={
                  side === "NO"
                    ? { background: "var(--ink)", color: "var(--paper)" }
                    : undefined
                }
              >
                Vote NO
              </button>
            </div>

            <button
              className="bet-confirm yes"
              style={{ marginTop: 16 }}
              onClick={() => submit("vote")}
              disabled={busy}
            >
              {busy && mode === "vote"
                ? "Voting…"
                : `Cast sealed ${side} ballot`}
            </button>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--rule-soft)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Coercion resistance · masking
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--ink-soft)",
                  lineHeight: 1.55,
                }}
              >
                Masking re-randomizes a <b>random</b> voter&apos;s ballot — not
                necessarily yours — producing a fresh ciphertext for the same
                underlying vote. Every mask is cover traffic: an observer
                can&apos;t tell whose ballot changed or prove how anyone voted.
                The more masks, the stronger the coercion resistance. No
                signature needed — masking any slot is permissionless.
              </div>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => submit("mask")}
                disabled={busy}
              >
                {busy && mode === "mask" ? "Masking…" : "Mask a ballot"}
              </button>
            </div>

            {busy && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--ink-soft)",
                }}
              >
                {phaseLabel(phase, mode)}
              </div>
            )}
          </div>
        )}

        {phase === "done" && (
          <div
            style={{
              marginTop: 16,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--live)",
            }}
          >
            ● {mode === "mask" ? "Ballot masked." : "Sealed ballot submitted."}
            {txHash && (
              <>
                {" "}
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--ink)",
                    borderBottom: "1px solid var(--ink)",
                  }}
                >
                  view tx
                </a>
              </>
            )}
            <div style={{ marginTop: 6, color: "var(--muted)" }}>
              {mode === "mask"
                ? `A random voter's slot${maskedSlot ? ` (${shortAddr(maskedSlot)})` : ""} was re-randomized — its ciphertext changed, the vote did not.`
                : "Your vote stays encrypted until the committee threshold-decrypts the tally."}
            </div>
          </div>
        )}

        {err && (
          <div
            style={{
              marginTop: 14,
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--amber-ink)",
              wordBreak: "break-word",
              lineHeight: 1.55,
            }}
          >
            {err}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <AttesterMint />
      </div>
    </div>
  );
}
