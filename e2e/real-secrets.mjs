/**
 * The secrets the backend persists under a config root, and a snapshot of
 * their state in the developer's *real* config dir — the one that would be
 * used if `CCTRACE_CONFIG_DIR` were not set. `e2e/prepare.mjs` records the
 * snapshot before any server starts; `expectSecretOnTestPath` in
 * `e2e/helpers.ts` asserts nothing changed: no file created, modified, or
 * deleted (revoke removes `clients/<name>.jwt`, so absence alone proves nothing).
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { appConfigRoot } from "../bin/api-token.mjs";

export const SECRET_FILES = ["api-secret", "clients.json", "clients/web-ui.jwt", "clients/tui.jwt"];

export function realConfigRoot() {
  const env = { ...process.env };
  delete env.CCTRACE_CONFIG_DIR;
  return appConfigRoot({ env });
}

/** `{ [absolute path]: { exists, mtimeMs } }` for every real secret file. */
export function snapshotRealSecrets(root = realConfigRoot()) {
  const out = {};
  for (const file of SECRET_FILES) {
    const path = join(root, file);
    out[path] = existsSync(path)
      ? { exists: true, mtimeMs: statSync(path).mtimeMs }
      : { exists: false, mtimeMs: null };
  }
  return out;
}
