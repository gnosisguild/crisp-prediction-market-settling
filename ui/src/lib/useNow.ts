"use client";

import { useEffect, useState } from "react";

/// Returns the current unix time in seconds, re-renders on every tick.
/// Use to drive countdown displays without polling the RPC.
export function useNow(intervalMs = 1000): number {
  // Start with NaN on SSR, then hydrate client-side. Components that pass `nowSec`
  // to fmtRel etc. should accept undefined gracefully — we coerce to undefined when
  // NaN so the existing fallbacks in fmtRel still work.
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now ?? Math.floor(Date.now() / 1000);
}
