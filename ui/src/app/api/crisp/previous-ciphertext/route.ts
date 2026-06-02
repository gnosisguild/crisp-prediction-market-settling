// Server-side proxy for the CRISP slot ciphertext lookup, needed to MASK (re-randomize) a ballot.
// POST {round_id, address} → {ciphertext: number[]} or null when the slot is empty (relay 404).
// Mirrors @crisp-e3/sdk getPreviousCiphertext (state/previous-ciphertext). Only carries the
// already-encrypted ciphertext — never a cleartext vote.

import { NextResponse } from "next/server";

const ENCLAVE_API = (
  process.env.ENCLAVE_API ??
  process.env.NEXT_PUBLIC_ENCLAVE_API ??
  "https://crisp-api.enclave.gg"
).replace(/\/$/, "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { e3Id?: string | number; address?: string };
  const e3Id = Number(body.e3Id);
  if (!Number.isFinite(e3Id) || e3Id <= 0 || !body.address) {
    return NextResponse.json({ error: "missing e3Id / address" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${ENCLAVE_API}/state/previous-ciphertext`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ round_id: e3Id, address: body.address }),
    });
    if (resp.status === 404) {
      return NextResponse.json({ ciphertext: null }); // empty slot — mask becomes a zero decoy
    }
    if (!resp.ok) {
      return NextResponse.json({ error: `CRISP relay ${resp.status}` }, { status: 502 });
    }
    const data = (await resp.json()) as { ciphertext?: number[] };
    return NextResponse.json({ ciphertext: data.ciphertext ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
