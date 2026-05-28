# CRISP × trueo — Encrypted-Vote Prediction Market PoC

A prediction market resolved by an **encrypted CRISP committee vote** instead of a human resolver, price feed, or optimistic oracle. The `CRISPResolverAdapter` (~100 lines) wires real CRISP on Sepolia to a trueo-shaped market manager (since trueo itself isn't on Sepolia).

## What's in the repo

```
contracts/        Foundry — CRISPResolverAdapter, trueo-shaped market manager,
                  Sepolia-fork test against real CRISP
ui/               Next.js trader UI (Buy YES / Buy NO via CPMM, settle, redeem)
voter-cli/        Voter CLI using @crisp-e3/sdk
scripts/          .env-driven bun orchestrators (prep / cast / resolve / e2e)
```

## Quick start (Sepolia + real CRISP)

```bash
cp .env.example .env                     # fill in RPC, ENCLAVE_API, keys
bun run sepolia                          # deploy trueo-shaped market manager + adapter
                                         # → paste printed USDC/BONDS/MANAGER/ADAPTER into .env
bun run ui                               # http://localhost:3000 — create a market
                                         # → paste market address into .env as MARKET=
bun run e2e YES                          # prep → cast → resolve in one command
```

Run the orchestrators individually if you want to pause between steps:
- `bun run prep` — `openVote` → wait DKG + server-side census/`setMerkleRoot` → fetch round JSON
- `bun run cast YES` — sign + BFV-encrypt + Noir-prove + `publishInput`
- `bun run resolve` — wait decrypt → `proposeFromCRISP` → wait challenge → `redeemAll`

Or as individual steps (read `MARKET` from `.env` if omitted):
- `bun run open` / `bun run status` / `bun run settle` / `bun run redeem`

Run `bun run cmds` for the full list.

## Architecture

```
voter (CLI) ──encrypted ballot──▶ CRISPProgram ──decoded tally──▶ CRISPResolverAdapter
                                                                          │
                                                       proposeResolution  │
                                                                          ▼
                                                                   TruthMarketManager
                                                                          │ challenge period
                                                                          ▼
                                                                       Finalized
                                                                       holders redeem
```

**Lifecycle (just-in-time):**

```
T0 ─── trading window ─── T_end ─── voting (CRISP) ─── decrypt ─── settle ─── challenge ─── redeem
       (mint / Buy YES /          openVote allocates              proposeFromCRISP    holders
        Buy NO via CPMM)          a fresh e3Id atomically;        reads decoded       claim
                                  committee forms only            tally + posts       paymentToken
                                  when voting starts              resolver bond
```

Key properties:
- **`openVote` is JIT**, not at market creation — no wasted ciphernode committee time during the trading window. Atomic e3Id allocation via real `Enclave.request()`.
- **`proposeFromCRISP` is permissionless**: the (market → e3Id) binding is immutable after `openVote`, the tally is deterministic on-chain, and the adapter pays its own resolver bond. Any caller costs only gas.
- **Constant credit mode** (1 vote per voter, no token snapshot weight). Configurable: set `CREDIT_MODE=1` to use token-weighted votes instead.

## Integration with real trueo (Base mainnet, future work)

The trueo-shaped contracts (`SimpleTruthMarketManager`, `SimpleTruthMarket`, `SimpleOracleBonds`) implement the subset of `ITruthMarketManager` / `ITruthMarket` that `CRISPResolverAdapter` calls. To swap in real trueo:

1. **Deploy `CRISPResolverAdapter` on the chain where CRISP also lives**, pointing at:
   - `truthMarketManager = 0x61A98Bef11867c69489B91f340fE545eEfc695d7` (live trueo on Base)
   - `paymentToken = 0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B` (yvUSDC)
   - `crispProgram` + `enclave` = whatever CRISP is deployed at on that chain
2. **The adapter doesn't change.** `proposeResolution(market, outcome)` is permissionless on real trueo — caller posts the `resolverBondAmount` (~250 yvUSDC) and becomes recorded as `resolverAddress(market)`. The adapter does exactly this.
3. **Operator setup is the same.** `openVote → vote-real → proposeFromCRISP`.

A possible deeper integration (out of scope) is replacing trueo's **OracleCouncil** with a CRISP-driven dispute resolver — every disputed market spawns a fresh E3 and the council vote is the threshold-decrypted tally. Same adapter shape; only the entry point changes (`resolveMarketByCouncil` instead of `proposeResolution`).

## Tests

```bash
bun run test:fork    # Sepolia fork — adapter.openVote against real CRISP
bun run test:all     # all Foundry tests
```

## License

LGPL-3.0-only.
