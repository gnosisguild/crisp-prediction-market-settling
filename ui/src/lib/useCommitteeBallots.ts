"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, type Address, type Hex } from "viem";

const InputPublishedAbi = parseAbiItem(
  "event InputPublished(uint256 indexed e3Id, bytes encryptedVote, uint256 index)",
);

export type Ballot = {
  txHash: Hex;
  blockNumber: bigint;
  blockTimestamp: bigint;
  submitter: Address;          // tx.from (the wallet that submitted publishInput)
  encryptedVote: Hex;
  index: bigint;
};

// Sepolia produces ~12s blocks. 50_000 blocks ≈ 1 week — ample lookback for a demo while
// keeping the getLogs range bounded.
const LOOKBACK_BLOCKS = 50_000n;
const POLL_MS = 15_000;
const ZERO = "0x0000000000000000000000000000000000000000";

export function useCommitteeBallots(crispProgram: Address | undefined, e3Id: bigint): Ballot[] {
  const client = usePublicClient();
  const [ballots, setBallots] = useState<Ballot[]>([]);
  // Cache enriched ballots by a stable key so each poll only fetches tx/block for NEW ballots
  // instead of re-enriching everything (the old behaviour did up to ~64 RPC calls per tick).
  const cacheRef = useRef<Map<string, Ballot>>(new Map());

  useEffect(() => {
    cacheRef.current = new Map();
    setBallots([]);
    if (!client || !crispProgram || crispProgram === ZERO || e3Id === 0n) return;

    let cancelled = false;

    async function load() {
      try {
        const head = await client!.getBlockNumber();
        const fromBlock = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
        const logs = await client!.getLogs({
          address: crispProgram,
          event: InputPublishedAbi,
          args: { e3Id },
          fromBlock,
          toBlock: head,
        });

        const cache = cacheRef.current;
        // Only enrich ballots we haven't already fetched. Cap at the 32 most recent.
        const recent = logs.slice(-32);
        const fresh = recent.filter((l) => !cache.has(`${l.transactionHash}:${l.args.index ?? 0n}`));
        await Promise.all(
          fresh.map(async (log) => {
            const [tx, block] = await Promise.all([
              client!.getTransaction({ hash: log.transactionHash! }),
              client!.getBlock({ blockHash: log.blockHash! }),
            ]);
            cache.set(`${log.transactionHash}:${log.args.index ?? 0n}`, {
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              blockTimestamp: block.timestamp,
              submitter: tx.from,
              encryptedVote: (log.args.encryptedVote ?? "0x") as Hex,
              index: log.args.index ?? 0n,
            });
          }),
        );

        if (!cancelled) {
          const all = Array.from(cache.values()).sort((a, b) => Number(b.blockNumber - a.blockNumber));
          setBallots(all);
        }
      } catch (e) {
        // Network blip / RPC throttle — keep what we have and retry next tick.
        if (!cancelled) console.warn("useCommitteeBallots:", e instanceof Error ? e.message : e);
      }
    }

    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, crispProgram, e3Id]);

  return ballots;
}
