import { $ } from "bun";
await $`cd contracts && FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge test`;
