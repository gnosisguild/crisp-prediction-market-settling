// Dev convenience: writes MARKET=<address> into the repo-root .env so the bun
// orchestrators (prep / cast / resolve) pick up the just-created market without
// the user having to hand-edit .env.
//
// Local-only — guarded by NODE_ENV !== "production".

import { NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function mergeEnv(path: string, updates: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = existing.length > 0 ? existing.split("\n") : [];
  const trailingNewline = existing.endsWith("\n") || existing.length === 0;
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const remaining = new Map(Object.entries(updates));
  const reKey = (k: string) =>
    new RegExp(`^\\s*${k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*=`);
  const out = lines.map((line) => {
    for (const [k, v] of remaining) {
      if (reKey(k).test(line)) {
        remaining.delete(k);
        return `${k}=${v}`;
      }
    }
    return line;
  });
  for (const [k, v] of remaining) out.push(`${k}=${v}`);
  writeFileSync(path, out.join("\n") + (trailingNewline ? "\n" : ""));
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { market?: string };
  const market = body.market;
  if (typeof market !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(market)) {
    return NextResponse.json({ error: "invalid market address" }, { status: 400 });
  }
  // Next dev server cwd is ui/, root .env lives one level up.
  const envPath = join(process.cwd(), "..", ".env");
  try {
    mergeEnv(envPath, { MARKET: market });
    return NextResponse.json({ ok: true, path: envPath });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
