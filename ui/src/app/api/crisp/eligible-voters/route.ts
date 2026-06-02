// Server-side proxy for the CRISP census address list — needed to MASK a RANDOM voter's slot
// (cover traffic for coercion resistance). POST {e3Id} → [{ address, balance }].
// Mirrors crisp-aragon-plugin-app's getEligibleVoters (state/eligible-addresses).

import { NextResponse } from "next/server";

const ENCLAVE_API = (
  process.env.ENCLAVE_API ??
  process.env.NEXT_PUBLIC_ENCLAVE_API ??
  "https://crisp-api.enclave.gg"
).replace(/\/$/, "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { e3Id?: string | number };
  const e3Id = Number(body.e3Id);
  if (!Number.isFinite(e3Id) || e3Id <= 0) {
    return NextResponse.json({ error: "invalid e3Id" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${ENCLAVE_API}/state/eligible-addresses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ round_id: e3Id }),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `CRISP relay ${resp.status}` }, { status: 502 });
    }
    const data = (await resp.json()) as Array<{ address: string; balance: string | number }>;
    const voters = Array.isArray(data)
      ? data.map((v) => ({ address: v.address, balance: Number(v.balance) }))
      : [];
    return NextResponse.json({ voters });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
