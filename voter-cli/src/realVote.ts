// SPDX-License-Identifier: LGPL-3.0-only
//
// Real CRISP vote submission using @crisp-e3/sdk. Generates a BFV-encrypted
// ballot + Noir proof and broadcasts it via the CRISP server's /voting/broadcast
// endpoint (which submits publishInput on chain). Mirrors crisp-aragon-plugin-app.

import { readFileSync } from "node:fs";
import { CrispSDK, encodeSolidityProof, generateVoteProof } from "@crisp-e3/sdk";
import { hashMessage } from "viem";
import type { Hex } from "viem";
import { walletClient } from "./clients.js";

export type RoundData = {
  // e3Id this snapshot was fetched against; downstream checks `adapter.e3IdOf(market)`
  // against it and bails out if the market has been rebound to a different round.
  e3Id: string;     // bigint string (decimal)
  publicKey: number[];
  leaves: string[]; // bigint hex strings
  balance: string;  // bigint string
};

export async function loadRoundData(path: string): Promise<RoundData> {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Partial<RoundData>;
  if (!data.publicKey || !data.leaves || !data.balance || !data.e3Id) {
    throw new Error(`round data missing fields (e3Id/publicKey/leaves/balance): ${path}`);
  }
  return data as RoundData;
}

export async function submitRealVote(opts: {
  e3Id: bigint;
  side: "YES" | "NO";
  weight: bigint;
  round: RoundData;
  enclaveApi: string;
}): Promise<Hex> {
  const { e3Id, side, weight, round, enclaveApi } = opts;
  const wallet = walletClient();

  // CRISP identity message is per-round; slotAddress = wallet address (census leaves
  // are hashes of token-holder wallets, so slot must equal wallet for the circuit's
  // slot⇄merkle binding to pass).
  const message = `Vote for round ${e3Id}`;
  const signature = (await wallet.signMessage({ message })) as Hex;
  const messageHash = hashMessage(message);
  const slotAddress = wallet.account.address;
  console.log(`signing "${message}" with ${slotAddress}`);

  const vote = side === "YES" ? [Number(weight), 0] : [0, Number(weight)];
  const publicKey = new Uint8Array(round.publicKey);
  const merkleLeaves = round.leaves.map((s) => BigInt(s));
  const balance = BigInt(round.balance);

  if (weight > balance) throw new Error(`weight ${weight} exceeds census balance ${balance}`);
  if (weight > 1n) {
    // CONSTANT credit mode (the PoC default) gives every voter 1 credit; weight > 1
    // will fail the Noir vote-validity proof.
    console.warn(`warning: weight=${weight} > 1 will fail under CONSTANT credit mode`);
  }

  console.log("generating BFV ciphertext + Noir proof (~10-30s on first run)");
  let proof;
  try {
    proof = enclaveApi
      ? await new CrispSDK(enclaveApi).generateVoteProof({
          e3Id: Number(e3Id), publicKey, balance, slotAddress, merkleLeaves, vote, signature, messageHash,
        })
      : await generateVoteProof({
          publicKey, balance, slotAddress, merkleLeaves, vote, signature, messageHash,
        });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Leaf not found in the tree")) {
      throw new Error(
        `\n  ✗ Your address (${slotAddress}) is not in the CRISP census for E3 #${e3Id}.` +
          `\n  The CRISP server only includes CENSUS_TOKEN holders present at openVote time.` +
          `\n  Fix: ensure VOTER_KEY corresponds to a wallet in VOTERS, then create a fresh market.\n` +
          `\n  Underlying SDK error: ${msg}`,
      );
    }
    throw e;
  }

  const encoded = encodeSolidityProof(proof);

  if (!enclaveApi) throw new Error("enclaveApi required for /voting/broadcast");
  const broadcastUrl = `${enclaveApi.replace(/\/$/, "")}/voting/broadcast`;
  console.log(`broadcasting via ${broadcastUrl}`);
  const resp = await fetch(broadcastUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ round_id: Number(e3Id), encoded_proof: encoded, address: wallet.account.address }),
  });
  if (!resp.ok) {
    const raw = await resp.text();
    let detail = raw.slice(0, 500);
    try {
      const j = JSON.parse(raw) as { message?: string };
      if (j.message) detail = j.message;
    } catch { /* not JSON */ }
    const label = resp.status === 500 ? "CRISP server error (500)" : `CRISP server ${resp.status}`;
    throw new Error(`\n  ✗ ${label}\n    POST ${broadcastUrl}\n    ${detail}\n`);
  }
  const body = (await resp.json()) as { status?: string; tx_hash?: string; message?: string; is_vote_update?: boolean };
  if (body.status !== "success" && body.status !== "Success") {
    throw new Error(`broadcast failed: status=${body.status} message=${body.message ?? "(none)"}`);
  }
  const hash = (body.tx_hash ?? "") as Hex;
  console.log(`✓ ${body.is_vote_update ? "vote updated" : "vote submitted"}: ${hash}`);
  return hash;
}
