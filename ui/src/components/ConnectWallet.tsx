"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useState } from "react";
import { activeChain } from "@/lib/wagmi";

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    if (chainId !== activeChain.id) {
      return (
        <button className="btn amber" onClick={() => switchChain({ chainId: activeChain.id })}>
          Switch to {activeChain.name}
        </button>
      );
    }
    return (
      <button className="btn ghost" onClick={() => disconnect()} title={address}>
        {shortAddr(address)} · disconnect
      </button>
    );
  }

  // Single connector? skip the menu.
  const injectedConnector = connectors.find((c) => c.type === "injected") ?? connectors[0];

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn"
        onClick={async () => {
          if (connectors.length === 1) {
            await connectAsync({ connector: injectedConnector });
          } else {
            setOpen((o) => !o);
          }
        }}
        disabled={isPending}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>

      {open && connectors.length > 1 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--paper)",
            border: "1px solid var(--ink)",
            minWidth: 180,
            zIndex: 50,
          }}
        >
          {connectors.map((c) => (
            <button
              key={c.uid}
              className="nav-tab"
              style={{ width: "100%", textAlign: "left", borderRight: "none", borderBottom: "1px solid var(--rule-soft)" }}
              onClick={async () => {
                setOpen(false);
                try {
                  await connectAsync({ connector: c });
                } catch {
                  // user rejected or extension not installed — surface in error block below
                }
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--paper)",
            border: "1px solid var(--amber-ink)",
            padding: "6px 10px",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--amber-ink)",
            maxWidth: 260,
          }}
        >
          {error.message.split("\n")[0]}
        </div>
      )}
    </div>
  );
}
