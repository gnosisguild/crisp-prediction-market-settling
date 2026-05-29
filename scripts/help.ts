// Print the available bun run commands.
const groups: Array<[string, Array<[string, string]>]> = [
  ["Setup", [
    ["bun run sepolia",                       "deploy mocks+adapter, mint Sepolia USDC, seed adapter"],
    ["bun run top-up [amount=20]",            "mint Sepolia USDC + topUpFee on the adapter (when openVote runs low)"],
    ["bun run fund-voters",                  "mint 1 CENSUS_TOKEN to each address in VOTERS (.env)"],
    ["bun run create-market",                 "create + seed an AMM market (writes MARKET to .env)"],
    ["bun run ui",                            "start the Next.js trader UI"],
  ]],
  ["End-to-end voting (reads .env)", [
    ["bun run fresh",                         "create-market → wait close → openVote → DKG → fetch → vote"],
    ["bun run e2e [YES|NO]",                  "prep + cast + resolve in one command"],
    ["bun run prep",                          "openVote → wait DKG + server-side census/setMerkleRoot → fetch round.json"],
    ["bun run cast [YES|NO]",                 "sign + BFV-encrypt + Noir-prove + publishInput"],
    ["bun run resolve",                       "wait decrypt → settle → wait challenge → redeem"],
  ]],
  ["Single steps ([market] from .env if omitted)", [
    ["bun run open [market]",                 "adapter.openVote — allocates fresh e3Id"],
    ["bun run status [market]",               "show CRISP committee stage + (if decrypted) tally"],
    ["bun run settle [market]",               "adapter.proposeFromCRISP — proposes outcome to trueo"],
    ["bun run redeem [market]",               "redeem caller's winning shares"],
  ]],
  ["Operator helpers (low-level)", [
    ["bun run fetch-round [market]",          "fetch pk + token-holder leaves from CRISP server, write round.json"],
    ["bun run fetch-pk [market] [api]",       "just fetch BFV pk from CRISP server"],
    ["bun run vote [market] YES|NO <w> <round>", "raw vote-real (no .env-driven prep)"],
  ]],
  ["Tests", [
    ["bun run test:fork",                     "Foundry: SepoliaForkOpenVote — adapter.openVote against real CRISP on Sepolia"],
    ["bun run test:all",                      "all Foundry tests"],
  ]],
  ["Help", [
    ["bun run cmds",                          "this list"],
  ]],
];

console.log("");
for (const [title, items] of groups) {
  console.log(`\x1b[1m${title}\x1b[0m`);
  for (const [cmd, desc] of items) {
    console.log(`  ${cmd.padEnd(52)} ${desc}`);
  }
  console.log("");
}
console.log("Always use 'bun run <name>' — bare 'bun <name>' collides with reserved subcommands.");
console.log("");
console.log(".env vars used by scripts (see .env.example):");
console.log("  RPC, CHAIN_ID, MARKET, USDC/BONDS/MANAGER/ADAPTER/CRISP_PROGRAM/ENCLAVE,");
console.log("  DEPLOYER_KEY, VOTER_KEY, ENCLAVE_API, CENSUS_TOKEN.");
console.log("");
console.log("Census: the CRISP server snapshots holders of CENSUS_TOKEN (DVT by default).");
console.log("Each oracle should hold 1 unit of that token. The server handles setMerkleRoot.");
console.log("");
