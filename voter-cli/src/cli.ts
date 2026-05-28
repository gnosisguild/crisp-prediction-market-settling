#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { Address } from "viem";
import { publicClient, walletClient, CRISP_PROGRAM_ADDRESS, ADAPTER_ADDRESS, ENCLAVE_ADDRESS } from "./clients.js";
import { adapterAbi, crispProgramAbi, enclaveAbi, E3Stage, stageName } from "./abis.js";
import { loadRoundData, submitRealVote } from "./realVote.js";

// ============================================================================
// CRISP voter CLI — committee tool for CRISP-resolved markets on Sepolia.
//
// Just-in-time E3 model:
//   - Markets have no E3 id at creation. Once a market's trading window closes,
//     anyone calls `open <market>` which calls adapter.openVote (→ Enclave.request)
//     and binds a fresh E3 id to that market.
//   - Voters submit BFV-encrypted + Noir-proven ballots via `vote-real`.
//   - Once the committee threshold-decrypts the tally, anyone settles via the UI
//     (proposeFromCRISP).
//
// The CRISP server's indexer snapshots the census, hashes leaves, and calls
// setMerkleRoot from its own owner key — voters don't touch the census.
// ============================================================================

async function readStage(pub: ReturnType<typeof publicClient>, e3Id: bigint): Promise<number> {
  return (await pub.readContract({
    address: ENCLAVE_ADDRESS,
    abi: enclaveAbi,
    functionName: "getE3Stage",
    args: [e3Id],
  })) as number;
}

const argv = await yargs(hideBin(process.argv))
  .scriptName("crisp-vote")
  .command("e3-for", "Look up the E3 id bound to a market (or 0 if not yet opened)", (y) =>
    y.option("market", { type: "string", demandOption: true, describe: "Market address" }),
  )
  .command("open", "Open the CRISP vote for a market (only valid once trading has closed)", (y) =>
    y.option("market", { type: "string", demandOption: true, describe: "Market address" }),
  )
  .command("status", "Show the current state of an E3 vote (by E3 id or market address)", (y) =>
    y
      .option("e3", { type: "string", describe: "E3 id" })
      .option("market", { type: "string", describe: "Market address (looks up the E3 id)" })
      .check((a) => {
        if (!a.e3 && !a.market) throw new Error("specify --e3 or --market");
        return true;
      }),
  )
  .command("tally", "Show the decrypted tally for an E3 (if Complete)", (y) =>
    y
      .option("e3", { type: "string" })
      .option("market", { type: "string" })
      .check((a) => {
        if (!a.e3 && !a.market) throw new Error("specify --e3 or --market");
        return true;
      }),
  )
  .command("fetch-pk", "Fetch the BFV committee public key for an E3 from a CRISP server", (y) =>
    y
      .option("market", { type: "string", describe: "Market address (looks up e3Id)" })
      .option("e3", { type: "string", describe: "E3 id directly" })
      .option("enclave-api", { type: "string", demandOption: true, describe: "CRISP server URL (e.g. https://your-crisp-server)" })
      .option("out", { type: "string", describe: "If set, write hex-prefixed pk to this file instead of stdout" })
      .check((a) => {
        if (!a.e3 && !a.market) throw new Error("specify --e3 or --market");
        return true;
      }),
  )
  .command("fetch-round", "Fetch pk + token-holder leaves from CRISP server and write a round-data JSON for vote-real", (y) =>
    y
      .option("market", { type: "string", describe: "Market address (looks up e3Id)" })
      .option("e3", { type: "string", describe: "E3 id directly" })
      .option("enclave-api", { type: "string", demandOption: true, describe: "CRISP server URL" })
      .option("balance", { type: "string", default: "1", describe: "Voter's census balance (1 for 1-token-per-oracle setup)" })
      .option("out", { type: "string", demandOption: true, describe: "Output path for round-data JSON" })
      .check((a) => {
        if (!a.e3 && !a.market) throw new Error("specify --e3 or --market");
        return true;
      }),
  )
  .command("vote-real", "BFV-encrypted ballot + Noir proof → CRISPProgram.publishInput", (y) =>
    y
      .option("market", { type: "string", demandOption: true, describe: "Market address" })
      .option("side", { type: "string", choices: ["YES", "NO"] as const, demandOption: true })
      .option("weight", { type: "string", default: "1", describe: "Vote weight (must be ≤ balance in census)" })
      .option("round-data", { type: "string", demandOption: true, describe: "Path to round JSON (publicKey + leaves + balance)" })
      .option("enclave-api", { type: "string", demandOption: true, describe: "CRISP server URL (used for previous-ciphertext fetch and /voting/broadcast)" }),
  )
  .demandCommand(1)
  .strict()
  .help()
  .parse();

const cmd = argv._[0] as string;
const pub = publicClient();

async function resolveE3(): Promise<bigint> {
  if (argv.e3) return BigInt(argv.e3 as string);
  const market = argv.market as Address;
  const id = (await pub.readContract({
    address: ADAPTER_ADDRESS,
    abi: adapterAbi,
    functionName: "e3IdOf",
    args: [market],
  })) as bigint;
  if (id === 0n) {
    console.error(`No E3 opened for market ${market} yet. Has trading closed? Try: crisp-vote open --market ${market}`);
    process.exit(1);
  }
  return id;
}

switch (cmd) {
  case "e3-for": {
    const market = argv.market as Address;
    const id = (await pub.readContract({
      address: ADAPTER_ADDRESS,
      abi: adapterAbi,
      functionName: "e3IdOf",
      args: [market],
    })) as bigint;
    console.log(`market ${market}`);
    console.log(`  e3Id: ${id === 0n ? "(not opened)" : id.toString()}`);
    break;
  }

  case "open": {
    const market = argv.market as Address;
    const wallet = walletClient();
    console.log(`opening CRISP vote for market ${market}`);
    console.log(`opener: ${wallet.account.address}`);
    const hash = await wallet.writeContract({
      address: ADAPTER_ADDRESS,
      abi: adapterAbi,
      functionName: "openVote",
      args: [market],
    });
    await pub.waitForTransactionReceipt({ hash });
    const id = (await pub.readContract({
      address: ADAPTER_ADDRESS,
      abi: adapterAbi,
      functionName: "e3IdOf",
      args: [market],
    })) as bigint;
    console.log(`✓ tx: ${hash}`);
    console.log(`  e3Id allocated: ${id}`);
    break;
  }

  case "status": {
    const e3Id = await resolveE3();
    const stage = await readStage(pub, e3Id);
    console.log(`E3 #${e3Id}  stage=${stage} (${stageName(stage)})`);
    if (stage >= E3Stage.Complete) {
      const tally = (await pub.readContract({
        address: CRISP_PROGRAM_ADDRESS,
        abi: crispProgramAbi,
        functionName: "decodeTally",
        args: [e3Id],
      })) as readonly bigint[];
      console.log(`  tally: YES=${tally[0] ?? 0n}  NO=${tally[1] ?? 0n}`);
    } else {
      console.log("  tally: sealed (committee has not threshold-decrypted yet)");
    }
    break;
  }

  case "tally": {
    const e3Id = await resolveE3();
    const stage = await readStage(pub, e3Id);
    if (stage < E3Stage.Complete) {
      console.error(`E3 #${e3Id} is not Complete yet (stage=${stageName(stage)}). Tally is sealed.`);
      process.exit(1);
    }
    const tally = (await pub.readContract({
      address: CRISP_PROGRAM_ADDRESS,
      abi: crispProgramAbi,
      functionName: "decodeTally",
      args: [e3Id],
    })) as readonly bigint[];
    const yes = tally[0] ?? 0n;
    const no = tally[1] ?? 0n;
    const total = yes + no;
    const pct = total === 0n ? "—" : `${(Number((yes * 1000n) / total) / 10).toFixed(1)}%`;
    console.log(`E3 #${e3Id}  YES=${yes}  NO=${no}  implied=${pct} YES`);
    break;
  }

  case "fetch-pk": {
    const e3Id = await resolveE3();
    const enclaveApi = (argv["enclave-api"] as string).replace(/\/$/, "");
    const url = `${enclaveApi}/state/lite`;
    console.error(`POST ${url}  round_id=${e3Id}`);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ round_id: Number(e3Id) }),
    });
    if (!resp.ok) {
      console.error(`server returned ${resp.status} ${resp.statusText}`);
      const body = await resp.text();
      console.error(body.slice(0, 500));
      process.exit(1);
    }
    const data = (await resp.json()) as { committee_public_key?: unknown };
    const raw = data.committee_public_key;
    let bytes: number[];
    if (Array.isArray(raw)) {
      bytes = raw.map((x) => Number(x));
    } else if (typeof raw === "string") {
      const hex = raw.replace(/^0x/, "");
      bytes = [];
      for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    } else {
      console.error("unexpected committee_public_key shape:", typeof raw);
      console.error(JSON.stringify(data, null, 2).slice(0, 500));
      process.exit(1);
    }
    const hex = "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    console.error(`pk: ${bytes.length} bytes`);
    if (argv.out) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(argv.out as string, hex);
      console.error(`wrote ${argv.out}`);
    } else {
      console.log(hex);
    }
    break;
  }

  case "fetch-round": {
    const e3Id = await resolveE3();
    const enclaveApi = (argv["enclave-api"] as string).replace(/\/$/, "");
    const outPath = argv.out as string;
    const balance = argv.balance as string;
    const { writeFileSync } = await import("node:fs");

    async function postJson<T>(path: string): Promise<T> {
      const r = await fetch(`${enclaveApi}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ round_id: Number(e3Id) }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`POST ${path} → ${r.status} ${r.statusText}\n${body.slice(0, 300)}`);
      }
      return (await r.json()) as T;
    }

    console.error(`fetching pk + leaves for E3 #${e3Id} from ${enclaveApi}`);
    const lite = await postJson<{ committee_public_key?: unknown }>("/state/lite");
    const leavesRaw = await postJson<unknown>("/state/token-holders");

    let pkBytes: number[];
    if (Array.isArray(lite.committee_public_key)) {
      pkBytes = lite.committee_public_key.map((x) => Number(x));
    } else if (typeof lite.committee_public_key === "string") {
      const hex = lite.committee_public_key.replace(/^0x/, "");
      pkBytes = [];
      for (let i = 0; i < hex.length; i += 2) pkBytes.push(parseInt(hex.slice(i, i + 2), 16));
    } else {
      throw new Error("unexpected committee_public_key shape in /state/lite response");
    }

    if (!Array.isArray(leavesRaw)) throw new Error("expected /state/token-holders to return a JSON array");
    const leaves: string[] = (leavesRaw as unknown[]).map((x) => {
      const s = String(x);
      return s.startsWith("0x") ? s : `0x${s}`;
    });

    const roundData = { publicKey: pkBytes, leaves, balance };
    writeFileSync(outPath, JSON.stringify(roundData, null, 2));
    console.error(`pk: ${pkBytes.length} bytes  ·  leaves: ${leaves.length}  ·  balance: ${balance}`);
    console.error(`wrote ${outPath}`);
    break;
  }

  case "vote-real": {
    const e3Id = await resolveE3();
    const market = argv.market as Address;
    const side = argv.side as "YES" | "NO";
    const weight = BigInt(argv.weight as string);
    const roundData = await loadRoundData(argv["round-data"] as string);
    const enclaveApi = argv["enclave-api"] as string;

    console.log(`voting in E3 #${e3Id} for market ${market}`);
    console.log(`side=${side} weight=${weight}`);

    await submitRealVote({
      e3Id,
      side,
      weight,
      round: roundData,
      enclaveApi,
    });
    break;
  }

  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
}
