// Run the Sepolia-fork integration test: adapter.openVote drives real Enclave.request.
import { $ } from "bun";
await $`cd contracts && FOUNDRY_DISABLE_NIGHTLY_WARNING=1 \
  forge test --match-contract SepoliaForkOpenVote -vv`;
