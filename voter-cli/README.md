# crisp-voter-cli

Low-level building blocks for the CRISP-resolved prediction market voting flow
on **Sepolia + real CRISP**. The orchestrators at the repo root
(`bun run prep` / `cast` / `resolve`) wrap these into a single .env-driven
flow — most users want those.

## Commands

Run `bun src/cli.ts --help` for the full list. Quick reference:

| Command        | What it does                                                |
|----------------|-------------------------------------------------------------|
| `open`         | adapter.openVote(market) — calls Enclave.request, allocates fresh e3Id |
| `e3-for`       | look up the e3Id bound to a market                          |
| `status`       | committee stage + (if decrypted) tally                      |
| `tally`        | show decoded tally (stage must be Complete)                 |
| `fetch-pk`     | fetch BFV committee public key from a CRISP server          |
| `fetch-round`  | fetch pk + token-holder leaves, write round-data JSON for `vote-real` |
| `vote-real`    | sign + BFV-encrypt + Noir-prove + publishInput              |

The CRISP server's indexer snapshots the census + calls `setMerkleRoot` from
its own owner key — voters don't touch the census, and there is no operator
helper for it here.

## Env

Configured by repo-root `.env` (Bun auto-loads):

```
RPC                Sepolia RPC URL
CHAIN_ID           11155111 (Sepolia)
ENCLAVE            real Enclave on Sepolia
CRISP_PROGRAM      real CRISPProgram on Sepolia
ADAPTER            our CRISPResolverAdapter
VOTER_KEY          signer for vote-real / open (must be one of VOTERS)
```

## What `vote-real` actually does

1. Signs the canonical CRISP identity message → derives the voter's slot address
2. BFV-encrypts the ballot `[1,0]` (YES) or `[0,1]` (NO) under the committee public key
3. Generates the Noir proof of valid encoding + Merkle membership
4. Calls `CRISPProgram.publishInput(e3Id, encodedProof)`

Takes ~30–110s the first time (Barretenberg WASM warmup), faster on subsequent calls.
