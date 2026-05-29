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

## Try it on Sepolia (live demo)

Cast an encrypted vote on a real market end-to-end without deploying anything. The frontend handles market creation + trading; voting itself runs from this CLI.

Live frontend: **https://crisp-prediction-market-settling.vercel.app/**

You'll need a Sepolia wallet with ~0.05 ETH, plus `git`, `bun`, and `foundry` (for `cast`).

### 1. Get the CLI

```bash
git clone <this repo>
cd crisp-prediction-market
bun install
cp .env.example .env
```

In `.env` set:

```
RPC=https://eth-sepolia.g.alchemy.com/v2/<your-key>
DEPLOYER_KEY=0x<wallet with Sepolia ETH>
VOTER_KEY=0x<can be the same wallet>
VOTERS=0x<your wallet address>                   # comma-separated; add yourself
ENCLAVE_API=https://crisp-api.enclave.gg
```

The contract addresses already in `.env.example` point at the current Sepolia deployment (Enclave, CRISPProgram, the deployed adapter/manager/USDC). Leave them.

### 2. Top up the adapter so `openVote` can pay Enclave's fee (~5.3 USDC)

```bash
bun run top-up
```

Permissionless: mints 20 mUSDC to you and forwards them into the adapter's fee escrow.

### 3. Give yourself a census token (must happen BEFORE step 5)

```bash
bun run fund-voters
```

Mints 1 DVT to each address in `VOTERS`. The CRISP server snapshots DVT holders at `openVote` time — fund before opening, not after.

### 4. Create a market on the frontend

Open https://crisp-prediction-market-settling.vercel.app/create, connect your wallet, pick a question and a short trading window (1 minute is fine for testing), click *Create*. Copy the new market address from the URL bar (`/markets/0x…`) into your `.env`:

```
MARKET=0x<the new market>
```

### 5. Wait for trading to close, then vote

```bash
bun run fresh    # waits for window close → openVote → DKG → fetch round → broadcast vote
```

Or step through manually:

```bash
bun run open        # adapter.openVote — allocates fresh e3Id
bun run status      # rerun until "Voting open"
bun run prep        # fetch pk + census leaves into /tmp/crisp-round-*.json
bun run cast YES    # or NO — generates the Noir proof and broadcasts
```

### 6. Resolve and redeem

After the input window closes (~5 minutes from `openVote`) the committee threshold-decrypts the tally; then:

```bash
bun run resolve     # proposeFromCRISP → wait challenge → redeemAll
```

### Inspect what happened

The committee + e3 lifecycle is visible at **https://dashboard.theinterfold.com** — pick the *E3 inspector* tab and select your e3 id to see committee selection, key publish, your `InputPublished` event, decryption stage, and final result.

### Troubleshooting

- `Your address is not in the CRISP census` — you didn't `fund-voters` before `openVote`, or the DVT mint hadn't confirmed yet. Create a fresh market and try again.
- `CRISP server error (500): execution reverted` — usually a stale `/tmp/crisp-round-*.json`. Re-run `bun run prep`.
- `TradingStillOpen` from `bun run open` — chain timestamp lags by a block; wait one and retry.
- `ERC20InsufficientAllowance` from `openVote` — adapter's fee balance is depleted. `bun run top-up` (permissionless).

## Quick start (Sepolia + real CRISP) — deploy your own

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
