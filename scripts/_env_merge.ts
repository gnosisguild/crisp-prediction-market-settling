// Idempotent .env merger. Sets KEY=VALUE in the given file: replaces the existing
// line if present (preserving leading comments + ordering), otherwise appends.
//
// Designed for dotenv-style files only. Doesn't try to handle multi-line values
// or quoted strings — addresses + simple ints are fine.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function mergeEnv(path: string, updates: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = existing.length > 0 ? existing.split("\n") : [];
  const trailingNewline = existing.endsWith("\n") || existing.length === 0;

  // Strip the file's trailing empty entry from a trailing newline so we don't append after it.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const remaining = new Map(Object.entries(updates));

  const reKey = (k: string) => new RegExp(`^\\s*${escapeRegex(k)}\\s*=`);

  const out = lines.map((line) => {
    for (const [k, v] of remaining) {
      if (reKey(k).test(line)) {
        remaining.delete(k);
        return `${k}=${v}`;
      }
    }
    return line;
  });

  for (const [k, v] of remaining) out.push(`${k}=${v}`);

  writeFileSync(path, out.join("\n") + (trailingNewline ? "\n" : ""));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
