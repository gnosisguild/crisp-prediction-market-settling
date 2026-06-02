# CRISP × trueo — Optimistic Market with a Private Attester Vote (PoC)

An **optimistic** prediction market whose final dispute layer is a **private CRISP committee vote**.
Resolutions are proposed and trusted by default; only a *disputed* one escalates — first to a
public (mock) token-holder vote, then to a sealed **CRISP attester** committee that
threshold-decrypts an encrypted ballot to settle the market. No single oracle holds the key.

This mirrors Trueo's optimistic-oracle escalation ladder, with the twist that the un-financialized
**attester** layer votes privately (coercion-resistant) instead of in the open. The
`CRISPResolverAdapter` (~100 lines) wires real CRISP on Sepolia to a trueo-shaped market manager
(trueo itself isn't on Sepolia).

## The resolution ladder

```
trading → propose (optimistic, trusted by default)
        → dispute
            → public token-holder vote        (mock — financialized, transparent)
            → escalate to attesters            ← openVote allocates the CRISP committee, JIT
                → attesters cast sealed ballots → committee threshold-decrypts
                → proposeFromCRISP settles the outcome
                → challenge window → Finalized → winners redeem
```

The CRISP committee is allocated **just-in-time on escalation**, not at market creation — most
resolutions are never disputed, so the ciphernodes aren't spun up until a dispute actually needs
a vote. An undisputed proposal finalizes on its own after the challenge window.

## What's in the repo

```
contracts/        Foundry — CRISPResolverAdapter, trueo-shaped market manager + escalation
                  ladder, ladder unit tests + a Sepolia-fork openVote test
ui/               Next.js app — trade (CPMM), walk the ladder, cast/MASK a sealed attester
                  ballot in-browser, settle, redeem
voter-cli/        Voter CLI using @crisp-e3/sdk (headless ballot casting)
scripts/          .env-driven bun orchestrators (ladder / prep / cast / resolve / e2e)
```

## Try it on Sepolia (live demo)

Walk a market through the full ladder and cast a real encrypted ballot — no deploy needed. Trading,
the ladder, and voting are all available in the frontend; the CLI is a headless alternative.

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

The contract addresses in `.env.example` point at the current Sepolia deployment. Leave them.

### 2. Top up the adapter so `openVote` can pay Enclave's fee (~5.3 USDC)

```bash
bun run top-up      # permissionless: mints 20 mUSDC to you, forwards into the adapter fee escrow
```

### 3. Give yourself a census token (must happen BEFORE the attester vote opens)

```bash
bun run fund-voters   # mints 1 DVT to each address in VOTERS; the CRISP server snapshots
                      # DVT holders at openVote time — fund before escalating, not after
```

### 4. Create a market on the frontend

Open `/create`, connect, pick a question + a short trading window (1 minute is fine), click
*Create*. Copy the new market address from the URL (`/markets/0x…`) into `.env` as `MARKET=0x…`.

### 5. Wait for trading to close, then run the whole flow

```bash
bun run fresh    # waits for close → ladder (propose → dispute → token vote → escalate)
                 # → openVote → DKG → fetch round → broadcast a sealed ballot
```

Or step through manually (each reads `MARKET` from `.env`):

```bash
bun run ladder      # propose → dispute → record token vote → escalate to attesters (idempotent)
bun run open        # adapter.openVote — allocates the CRISP committee (requires escalation)
bun run status      # rerun until "Voting open"
bun run prep        # ensures escalation, then fetches pk + census leaves to /tmp/crisp-round-*.json
bun run cast YES    # or NO — generates the Noir proof and broadcasts the sealed ballot
```

> The individual `propose` / `dispute` / `token-vote` / `escalate` commands exist too — `bun run ladder`
> just walks them in order. `openVote` **only works once a dispute has escalated to the attester
> layer**; calling it earlier reverts.

You can also do all of this in the UI: the market page walks the ladder, and once voting is open
the **Cast your sealed ballot** page (`/markets/<addr>/vote`) encrypts + proves the ballot in your
browser. That page also supports **masking** — re-randomizing a random voter's ballot as cover
traffic, the coercion-resistance primitive.

### 6. Resolve and redeem

After the input window closes (~5 minutes from `openVote`) the committee threshold-decrypts the
tally; then:

```bash
bun run resolve     # proposeFromCRISP (settle from attesters) → wait challenge → redeemAll
```

### Inspect what happened

The committee + E3 lifecycle is visible at **https://dashboard.theinterfold.com** — pick the
*E3 inspector* tab and your e3 id to see committee selection, key publish, your `InputPublished`
event, decryption stage, and final result.

### Troubleshooting

- `TradingStillOpen` from `bun run open` — `openVote` requires the market to be **escalated to the
  attester layer**. Run `bun run ladder` first (or use `bun run fresh` / `bun run prep`, which
  escalate for you). Also fires if the chain timestamp lags a block right after close — wait one.
- `Your address is not in the CRISP census` — you didn't `fund-voters` before `openVote`, or the
  DVT mint hadn't confirmed. Create a fresh market and try again.
- `CRISP server error (500): execution reverted` — usually a stale `/tmp/crisp-round-*.json`. Re-run `bun run prep`.
- `ERC20InsufficientAllowance` from `openVote` — adapter fee balance depleted. `bun run top-up`.

## Quick start (deploy your own)

```bash
cp .env.example .env                     # fill in RPC, ENCLAVE_API, keys
bun run sepolia                          # deploy manager + adapter → paste printed addresses into .env
bun run ui                               # http://localhost:3000 — create a market → paste MARKET= into .env
bun run e2e YES                          # ladder → prep → cast → resolve in one command
```

Run `bun run cmds` for the full command list.

## Architecture

```
                         optimistic ladder (on the market)
trading ─▶ propose ─▶ dispute ─▶ token vote ─▶ escalate
                                                   │ openVote (JIT)
                                                   ▼
voter (UI / CLI) ─encrypted ballot─▶ CRISPProgram ─decoded tally─▶ CRISPResolverAdapter
                                                                          │ proposeFromCRISP
                                                                          ▼  (settle from attesters)
                                                                   TruthMarketManager
                                                                          │ challenge period
                                                                          ▼
                                                                   Finalized · holders redeem
```

Key properties:
- **CRISP is the attester layer, reached only on escalation** — not the default resolver. The
  committee is allocated JIT via real `Enclave.request()` when a dispute escalates.
- **`openVote` / `proposeFromCRISP` are permissionless** — the (market → e3Id) binding is immutable,
  the tally is deterministic on-chain, and the adapter pays its own resolver bond. Any caller costs
  only gas.
- **Private attesters, public token vote.** The financialized token-holder stage is transparent on
  purpose; only the un-financialized attester ballots are sealed (CRISP), with optional **masking**
  for coercion resistance.
- **Constant credit mode** (1 vote per census member). Configurable to token-weighted.
- The optimistic propose/dispute/token-vote stages are **bond-free on-chain** in this PoC (bonds are
  narrated in the UI); only the attester resolver bond is real.

## Integration with real trueo

This PoC implements what would map onto trueo's **escalated dispute / OracleCouncil** layer: a
disputed market escalates and the council's verdict is the threshold-decrypted CRISP tally. To swap
in real trueo, deploy `CRISPResolverAdapter` on the chain where CRISP lives, pointing its
`truthMarketManager` at trueo and its `crispProgram` / `enclave` at the CRISP deployment; the
adapter posts the resolver bond and settles from the decrypted tally exactly as it does here.

## Tests

```bash
bun run test:all     # all Foundry tests (escalation-ladder unit tests + fork test)
bun run test:fork    # Sepolia fork — adapter.openVote against real CRISP (needs SEPOLIA_RPC)
```

## License

LGPL-3.0-only.
