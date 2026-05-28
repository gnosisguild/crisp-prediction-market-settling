// Process spawning helper. Bun's $ template literal doesn't propagate inline
// `VAR=value cmd` env shadowing (treats them as separate statements). We use
// node:child_process.spawn with explicit env so the shell semantics are
// predictable.

import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";

export type RunOpts = SpawnOptionsWithoutStdio & {
  /// Extra env to merge on top of process.env. Use this to inject keys.
  env?: NodeJS.ProcessEnv;
};

export async function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "inherit"],
      ...opts,
      env: { ...process.env, ...opts.env },
    });
    let stdout = "";
    p.stdout?.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      process.stdout.write(s);
      stdout += s;
    });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

/// Capture stdout without forwarding to console. Used for one-line fetches.
export async function runCapture(cmd: string, args: string[], opts: RunOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "inherit"],
      ...opts,
      env: { ...process.env, ...opts.env },
    });
    let stdout = "";
    p.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

export const voterCli = {
  /// Run a voter-cli command with given env injection. Inherits stdout/stderr.
  /// We invoke from the repo root (NOT cd'ing into voter-cli/) so Bun doesn't
  /// auto-load voter-cli/.env and shadow the values from the root .env.
  async exec(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    return run("bun", ["voter-cli/src/cli.ts", ...args], { env });
  },
  async capture(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    return runCapture("bun", ["voter-cli/src/cli.ts", ...args], { env });
  },
};

export const cast = {
  async send(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
    return run("cast", ["send", ...args], { env });
  },
  async call(args: string[]): Promise<string> {
    return runCapture("cast", ["call", ...args]);
  },
};
