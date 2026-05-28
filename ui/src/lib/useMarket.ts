"use client";

import { useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, marketAbi, adapterAbi, crispProgramAbi, enclaveAbi } from "@/lib/abis";
import { ADDRESSES } from "@/lib/addresses";

export function useMarket(market: Address, account?: Address) {
  // Static-ish market metadata + dynamic balances/state in a single multicall.
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: market, abi: marketAbi, functionName: "marketQuestion" },
      { address: market, abi: marketAbi, functionName: "marketSource" },
      { address: market, abi: marketAbi, functionName: "additionalInfo" },
      { address: market, abi: marketAbi, functionName: "endOfTrading" },
      { address: market, abi: marketAbi, functionName: "firstChallengePeriod" },
      { address: market, abi: marketAbi, functionName: "resolverBondAmount" },
      { address: market, abi: marketAbi, functionName: "getCurrentStatus" },
      { address: market, abi: marketAbi, functionName: "winningPosition" },
      { address: market, abi: marketAbi, functionName: "resolutionProposedAt" },
      { address: market, abi: marketAbi, functionName: "yesToken" },
      { address: market, abi: marketAbi, functionName: "noToken" },
      { address: ADDRESSES.adapter, abi: adapterAbi, functionName: "e3IdOf", args: [market] },
      { address: ADDRESSES.adapter, abi: adapterAbi, functionName: "proposed", args: [market] },
      { address: market, abi: marketAbi, functionName: "price" },
      { address: market, abi: marketAbi, functionName: "yesReserve" },
      { address: market, abi: marketAbi, functionName: "noReserve" },
    ],
    query: { refetchInterval: 8_000 },
  });

  const yesToken = data?.[9]?.result as Address | undefined;
  const noToken = data?.[10]?.result as Address | undefined;
  const e3Id = (data?.[11]?.result as bigint | undefined) ?? 0n;

  const { data: balances, refetch: refetchBal } = useReadContracts({
    contracts: account
      ? [
          { address: ADDRESSES.usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: ADDRESSES.usdc, abi: erc20Abi, functionName: "allowance", args: [account, market] },
          { address: yesToken!, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: noToken!, abi: erc20Abi, functionName: "balanceOf", args: [account] },
        ]
      : [],
    query: { enabled: Boolean(account && yesToken && noToken), refetchInterval: 10_000 },
  });

  const { data: oracle, refetch: refetchOracle } = useReadContracts({
    contracts:
      e3Id > 0n
        ? [
            { address: ADDRESSES.enclave, abi: enclaveAbi, functionName: "getE3Stage", args: [e3Id] },
            { address: ADDRESSES.crispProgram, abi: crispProgramAbi, functionName: "decodeTally", args: [e3Id] },
          ]
        : [],
    query: { enabled: e3Id > 0n, refetchInterval: 8_000 },
  });

  return {
    question: (data?.[0]?.result as string) ?? "",
    source: (data?.[1]?.result as string) ?? "",
    additionalInfo: (data?.[2]?.result as string) ?? "",
    endOfTrading: (data?.[3]?.result as bigint) ?? 0n,
    firstChallengePeriod: (data?.[4]?.result as bigint) ?? 0n,
    resolverBondAmount: (data?.[5]?.result as bigint) ?? 0n,
    status: Number(data?.[6]?.result ?? 0),
    winningPosition: (data?.[7]?.result as bigint) ?? 0n,
    resolutionProposedAt: (data?.[8]?.result as bigint) ?? 0n,
    yesToken,
    noToken,
    e3Id,
    proposedFromCrisp: Boolean(data?.[12]?.result),
    usdcBalance: balances?.[0]?.result as bigint | undefined,
    usdcAllowance: balances?.[1]?.result as bigint | undefined,
    yesBalance: balances?.[2]?.result as bigint | undefined,
    noBalance: balances?.[3]?.result as bigint | undefined,
    e3Stage: Number(oracle?.[0]?.result ?? 0),
    tally: (oracle?.[1]?.result as readonly bigint[] | undefined) ?? [],
    yesPrice: (data?.[13]?.result as readonly [bigint, bigint] | undefined)?.[0] ?? 5n * 10n ** 17n,
    noPrice: (data?.[13]?.result as readonly [bigint, bigint] | undefined)?.[1] ?? 5n * 10n ** 17n,
    yesReserve: (data?.[14]?.result as bigint) ?? 0n,
    noReserve: (data?.[15]?.result as bigint) ?? 0n,
    refresh: () => {
      void refetch();
      void refetchBal();
      void refetchOracle();
    },
  };
}
