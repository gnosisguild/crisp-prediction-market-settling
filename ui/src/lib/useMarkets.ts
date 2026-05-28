"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { managerAbi, marketAbi, adapterAbi } from "@/lib/abis";
import { ADDRESSES, isConfigured } from "@/lib/addresses";

export type MarketSummary = {
  address: Address;
  question: string;
  endOfTrading: bigint;
  status: number;
  winningPosition: bigint;
  e3Id: bigint;
  yesPrice: bigint; // 1e18 fixed-point implied probability of YES
};

/// Returns the list of market addresses from the manager.
export function useMarketAddresses() {
  const { data: count } = useReadContract({
    address: ADDRESSES.manager,
    abi: managerAbi,
    functionName: "numberOfActiveMarkets",
    query: { enabled: isConfigured, refetchInterval: 10_000 },
  });

  const indices = useMemo(() => {
    if (!count) return [] as bigint[];
    return Array.from({ length: Number(count) }, (_, i) => BigInt(i));
  }, [count]);

  const { data: addressResults } = useReadContracts({
    contracts: indices.map((i) => ({
      address: ADDRESSES.manager,
      abi: managerAbi,
      functionName: "getActiveMarketAddress",
      args: [i],
    })),
    query: { enabled: indices.length > 0, refetchInterval: 10_000 },
  });

  return useMemo(() => {
    if (!addressResults) return [] as Address[];
    return addressResults
      .map((r) => (r.status === "success" ? (r.result as Address) : undefined))
      .filter((x): x is Address => Boolean(x));
  }, [addressResults]);
}

/// Returns hydrated MarketSummary[] for the list view.
export function useMarkets(): MarketSummary[] {
  const addresses = useMarketAddresses();

  const { data } = useReadContracts({
    contracts: addresses.flatMap((m) => [
      { address: m, abi: marketAbi, functionName: "marketQuestion" },
      { address: m, abi: marketAbi, functionName: "endOfTrading" },
      { address: m, abi: marketAbi, functionName: "getCurrentStatus" },
      { address: m, abi: marketAbi, functionName: "winningPosition" },
      { address: ADDRESSES.adapter, abi: adapterAbi, functionName: "e3IdOf", args: [m] },
      { address: m, abi: marketAbi, functionName: "price" },
    ]),
    query: { enabled: addresses.length > 0, refetchInterval: 10_000 },
  });

  return useMemo(() => {
    if (!data) return [];
    return addresses.map((address, i) => {
      const base = i * 6;
      const priceTuple = data[base + 5]?.result as readonly [bigint, bigint] | undefined;
      return {
        address,
        question: (data[base + 0]?.result as string) ?? "",
        endOfTrading: (data[base + 1]?.result as bigint) ?? 0n,
        status: Number(data[base + 2]?.result ?? 0),
        winningPosition: (data[base + 3]?.result as bigint) ?? 0n,
        e3Id: (data[base + 4]?.result as bigint) ?? 0n,
        yesPrice: priceTuple?.[0] ?? 5n * 10n ** 17n,
      };
    });
  }, [data, addresses]);
}
