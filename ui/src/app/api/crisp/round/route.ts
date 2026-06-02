// Server-side proxy for the CRISP "round data" an attester needs to build a ballot:
//   - POST /state/lite           → committee BFV public key
//   - POST /state/token-holders  → census merkle leaves
//
// We proxy these (rather than calling them from the browser) to dodge CORS and keep the
// ENCLAVE_API base URL server-only. Only PUBLIC round data flows through here — never a vote.
// Mirrors the normalization in voter-cli/src/cli.ts:255-275 (fetch-round).

import { NextResponse } from "next/server";

const ENCLAVE_API = (
  process.env.ENCLAVE_API ??
  process.env.NEXT_PUBLIC_ENCLAVE_API ??
  "https://crisp-api.enclave.gg"
).replace(/\/$/, "");

async function postJson<T>(path: string, roundId: number): Promise<T> {
  const r = await fetch(`${ENCLAVE_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ round_id: roundId }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`POST ${path} → ${r.status} ${r.statusText}\n${body.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { e3Id?: string | number };
  const e3Id = Number(body.e3Id);
  if (!Number.isFinite(e3Id) || e3Id <= 0) {
    return NextResponse.json({ error: "invalid e3Id" }, { status: 400 });
  }

  try {
    const lite = await postJson<{ committee_public_key?: unknown }>("/state/lite", e3Id);
    const leavesRaw = await postJson<unknown>("/state/token-holders", e3Id);

    let publicKey: number[];
    if (Array.isArray(lite.committee_public_key)) {
      publicKey = lite.committee_public_key.map((x) => Number(x));
    } else if (typeof lite.committee_public_key === "string") {
      const hex = lite.committee_public_key.replace(/^0x/, "");
      publicKey = [];
      for (let i = 0; i < hex.length; i += 2) publicKey.push(parseInt(hex.slice(i, i + 2), 16));
    } else {
      throw new Error("unexpected committee_public_key shape in /state/lite response");
    }

    if (!Array.isArray(leavesRaw)) throw new Error("expected /state/token-holders to return a JSON array");
    const leaves: string[] = (leavesRaw as unknown[]).map((x) => {
      const s = String(x);
      return s.startsWith("0x") ? s : `0x${s}`;
    });

    return NextResponse.json({ publicKey, leaves });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
