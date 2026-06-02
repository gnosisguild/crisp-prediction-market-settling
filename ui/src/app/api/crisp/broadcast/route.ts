// Server-side proxy for the CRISP /voting/broadcast relay. The browser sends an ALREADY
// ENCRYPTED + proven ballot (encoded_proof) here; we forward it to ENCLAVE_API, which submits
// CRISPProgram.publishInput on chain. The cleartext vote never reaches this server — only the
// sealed proof + the voter address (which the relay learns anyway). Mirrors realVote.ts:88-104.

import { NextResponse } from "next/server";

const ENCLAVE_API = (
  process.env.ENCLAVE_API ??
  process.env.NEXT_PUBLIC_ENCLAVE_API ??
  "https://crisp-api.enclave.gg"
).replace(/\/$/, "");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    round_id?: number;
    encoded_proof?: string;
    address?: string;
  };
  if (typeof body.round_id !== "number" || !body.encoded_proof || !body.address) {
    return NextResponse.json({ error: "missing round_id / encoded_proof / address" }, { status: 400 });
  }

  try {
    const resp = await fetch(`${ENCLAVE_API}/voting/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        round_id: body.round_id,
        encoded_proof: body.encoded_proof,
        address: body.address,
      }),
    });
    const raw = await resp.text();
    if (!resp.ok) {
      let detail = raw.slice(0, 500);
      try {
        const j = JSON.parse(raw) as { message?: string };
        if (j.message) detail = j.message;
      } catch { /* not JSON */ }
      return NextResponse.json({ error: `CRISP relay ${resp.status}: ${detail}` }, { status: 502 });
    }
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
