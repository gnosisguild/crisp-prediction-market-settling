"use client";

import { useEffect, useState } from "react";
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

// Sepolia produces ~12s blocks. 100_000 blocks ≈ 2 weeks — more than enough lookback
// for any practical demo, while keeping getLogs cheap on free RPC endpoints.
const LOOKBACK_BLOCKS = 100_000n;
const POLL_MS = 8_000;

export function useCommitteeBallots(crispProgram: Address | undefined, e3Id: bigint): Ballot[] {
  const client = usePublicClient();
  const [ballots, setBallots] = useState<Ballot[]>([]);

  useEffect(() => {
    if (!client || !crispProgram || crispProgram === "0x0000000000000000000000000000000000000000" || e3Id === 0n) {
      setBallots([]);
      return;
    }

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

        // Enrich with tx.from + block.timestamp. Cap at 32 most-recent to keep RPC cheap.
        const recent = logs.slice(-32);
        const enriched = await Promise.all(
          recent.map(async (log) => {
            const [tx, block] = await Promise.all([
              client!.getTransaction({ hash: log.transactionHash! }),
              client!.getBlock({ blockHash: log.blockHash! }),
            ]);
            return {
              txHash: log.transactionHash!,
              blockNumber: log.blockNumber!,
              blockTimestamp: block.timestamp,
              submitter: tx.from,
              encryptedVote: (log.args.encryptedVote ?? "0x") as Hex,
              index: log.args.index ?? 0n,
            } satisfies Ballot;
          }),
        );

        if (!cancelled) {
          // Newest first.
          enriched.sort((a, b) => Number(b.blockNumber - a.blockNumber));
          setBallots(enriched);
        }
      } catch (e) {
        // Network blip / RPC throttle — keep what we have and try again on the next tick.
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
