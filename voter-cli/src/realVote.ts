// SPDX-License-Identifier: LGPL-3.0-only
//
// Real CRISP vote submission using @crisp-e3/sdk.
//   - Generates a BFV-encrypted ballot + Noir proof of valid encoding.
//   - Broadcasts via the CRISP server's /voting/broadcast endpoint, which submits
//     publishInput from the server's own key. Same flow as the official CRISP webapp
//     and crisp-aragon-plugin-app.
//
// Requires per-round inputs that come from CRISP's committee + census:
//   - publicKey   The BFV public key bytes produced by the committee's DKG.
//   - leaves      The census Merkle leaves (one per eligible voter).
// Both are produced off-chain by CRISP. The operator either:
//   a) runs a CRISP server and exposes /state/lite, OR
//   b) snapshots both into a JSON file the voter loads via --round-data.
//
// File format (--round-data):
//   {
//     "publicKey": [ /* uint8 bytes */ ],
//     "leaves":    [ "0x...", "0x...", ... ],   // bigint leaves as hex strings
//     "balance":   "100"                         // voter's balance in census (as string)
//   }

import { readFileSync } from "node:fs";
import {
  CrispSDK,
  encodeSolidityProof,
  generateVoteProof,
  SIGNATURE_MESSAGE,
  SIGNATURE_MESSAGE_HASH,
  getAddressFromSignature,
} from "@crisp-e3/sdk";
import type { Address, Hex } from "viem";
import { walletClient } from "./clients.js";

export type RoundData = {
  publicKey: number[];
  leaves: string[]; // bigint hex strings (e.g. "0x123...")
  balance: string;  // bigint string
};

export async function loadRoundData(path: string): Promise<RoundData> {
  const raw = readFileSync(path, "utf-8");
  const data = JSON.parse(raw) as Partial<RoundData>;
  if (!data.publicKey || !data.leaves || !data.balance) {
    throw new Error(`round data file missing publicKey / leaves / balance fields: ${path}`);
  }
  return data as RoundData;
}

/**
 * Submit a real BFV-encrypted YES/NO ballot to a CRISPProgram.
 *
 * @param e3Id            E3 id to vote in
 * @param side            "YES" | "NO" — option index 0 / 1
 * @param weight          vote weight (must be <= balance in the census)
 * @param round           round data (publicKey + leaves + balance)
 * @param enclaveApi      CRISP server URL — required, used for the SDK's
 *                        getPreviousCiphertext fetch and for broadcasting via
 *                        /voting/broadcast (the server submits publishInput on chain).
 */
export async function submitRealVote(opts: {
  e3Id: bigint;
  side: "YES" | "NO";
  weight: bigint;
  round: RoundData;
  enclaveApi: string;
}): Promise<Hex> {
  const { e3Id, side, weight, round, enclaveApi } = opts;

  const wallet = walletClient();

  // 1. Sign the canonical CRISP identity message. This derives the per-voter "slot
  //    address" inside the census — distinct from the wallet address (privacy).
  console.log(`signing CRISP identity message with ${wallet.account.address}`);
  const signature = (await wallet.signMessage({ message: SIGNATURE_MESSAGE })) as Hex;
  const slotAddress = await getAddressFromSignature(signature, SIGNATURE_MESSAGE_HASH);
  console.log(`slot address: ${slotAddress}`);

  // 2. Build the vote vector. Convention: option 0 = YES, option 1 = NO.
  //    Weight goes into the chosen side; 0 into the other.
  const vote = side === "YES" ? [Number(weight), 0] : [0, Number(weight)];

  // 3. Prepare SDK inputs.
  const publicKey = new Uint8Array(round.publicKey);
  const merkleLeaves = round.leaves.map((s) => BigInt(s));
  const balance = BigInt(round.balance);

  if (weight > balance) {
    throw new Error(`weight ${weight} exceeds census balance ${balance}`);
  }
  // In CONSTANT credit mode (default), every voter has exactly the constant credit amount
  // (typically 1). If the operator chose CONSTANT-1 in the adapter customParams, weight > 1
  // will fail the Noir vote-validity proof.
  if (weight > 1n) {
    console.warn(
      `warning: weight=${weight} > 1. If the CRISP E3 uses CONSTANT credit mode (default in this PoC, 1 credit/voter), only weight=1 ballots will be accepted by the proof verifier.`,
    );
  }

  // 4. Generate the proof. If we have an enclaveApi we go through CrispSDK so it can
  //    fetch the previous ciphertext (enabling vote updates). Otherwise call generateVoteProof
  //    directly with no previousCiphertext (fresh vote only).
  console.log("generating BFV ciphertext + Noir proof (this takes ~10-30s on first run)");
  let proof;
  try {
    proof = enclaveApi
      ? await new CrispSDK(enclaveApi).generateVoteProof({
          e3Id: Number(e3Id),
          publicKey,
          balance,
          slotAddress,
          merkleLeaves,
          vote,
          signature,
          messageHash: SIGNATURE_MESSAGE_HASH,
        })
      : await generateVoteProof({
          publicKey,
          balance,
          slotAddress,
          merkleLeaves,
          vote,
          signature,
          messageHash: SIGNATURE_MESSAGE_HASH,
        });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Leaf not found in the tree")) {
      throw new Error(
        `\n  ✗ Your address (${slotAddress}) is not in the CRISP census for E3 #${e3Id}.\n` +
          `\n  The CRISP server only includes holders of CENSUS_TOKEN that were present at` +
          `\n  E3 creation time (when openVote ran). To fix:` +
          `\n` +
          `\n    1. Make sure your VOTER_KEY in .env is one of the wallets in VOTERS` +
          `\n       (those are the addresses that get 1 DVT from \`bun run fund-voters\`).` +
          `\n    2. If you funded the oracles AFTER opening this vote, the snapshot for this` +
          `\n       E3 already happened without them — create a new market and run \`bun run prep\`` +
          `\n       again, OR open a fresh vote on the same market (currently not supported).` +
          `\n` +
          `\n  Underlying SDK error: ${msg}`,
      );
    }
    throw e;
  }

  // 5. Encode for the contract — order matches CRISPProgram.publishInput's abi.decode:
  //    (bytes noirProof, address slotAddress, bytes32 encryptedVoteCommitment, bytes encryptedVote)
  const encoded = encodeSolidityProof(proof);

  // 6. Broadcast via the CRISP server's /voting/broadcast endpoint (same path the
  //    official CRISP webapp + crisp-aragon-plugin-app take). The server is a relay
  //    that submits publishInput from its own key — matches the canonical flow.
  if (!enclaveApi) {
    throw new Error("enclaveApi is required: broadcast goes via CRISP server /voting/broadcast");
  }
  const broadcastUrl = `${enclaveApi.replace(/\/$/, "")}/voting/broadcast`;
  console.log(`broadcasting via ${broadcastUrl}`);
  const resp = await fetch(broadcastUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      round_id: Number(e3Id),
      encoded_proof: encoded,
      address: wallet.account.address,
    }),
  });
  if (!resp.ok) {
    const raw = await resp.text();
    // Try JSON first — broadcast endpoint returns { status, message, tx_hash? } on
    // error paths. Fall back to raw text for non-JSON responses (e.g. 502 from a
    // proxy). Truncate so we don't dump a stack trace into the terminal.
    let detail = raw.slice(0, 500);
    try {
      const j = JSON.parse(raw) as { message?: string; status?: string };
      if (j.message) detail = j.message;
    } catch {
      // not JSON; keep truncated raw
    }
    const label = resp.status === 500 ? "CRISP server error (500)" : `CRISP server ${resp.status}`;
    throw new Error(
      `\n  ✗ ${label}` +
        `\n    POST ${broadcastUrl}` +
        `\n    ${detail}` +
        `\n    Check the server logs for the full stack trace.\n`,
    );
  }
  const body = (await resp.json()) as {
    status?: string;
    tx_hash?: string;
    message?: string;
    is_vote_update?: boolean;
  };
  if (body.status !== "success" && body.status !== "Success") {
    throw new Error(`broadcast failed: status=${body.status} message=${body.message ?? "(none)"}`);
  }
  const hash = (body.tx_hash ?? "") as Hex;
  console.log(`✓ ${body.is_vote_update ? "vote updated" : "vote submitted"}: ${hash}`);
  return hash;
}
