/**
 * The web UI's HTTP API client credential — Node side.
 *
 * The Rust backend (`src-tauri/src/auth.rs`) requires every `/api/*` request
 * to carry the signed credential of a registered client. Two clients are
 * built in and registered on first start, `web-ui` and `tui`; the backend
 * writes their credentials to `<config root>/clients/<name>.jwt` so the
 * processes that need them can read them.
 *
 * In `cctrace --web` the browser UI is served by the Vite dev server on a
 * different origin from the API, so it can't receive the credential as a
 * same-origin cookie the way the Docker bundle does. Instead the Vite plugin
 * in `vite.config.ts` calls `readWebUiCredential()` here and serves the value
 * as the virtual module `virtual:cctrace-api-token` at *serve* time only.
 *
 * This module is strictly read-only: only the backend mints credentials (it
 * holds the signing key). Until the backend has started once, the file does
 * not exist and the credential is `null`; the plugin watches for it.
 */
import { readFileSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import { join } from "node:path";

/** Name of the built-in client the browser frontend runs as. */
export const WEB_UI_CLIENT = "web-ui";

/** Mirror of Rust's `dirs::config_dir()` for the three supported platforms. */
export function configDir({ platform = osPlatform(), env = process.env, home = homedir() } = {}) {
  if (platform === "win32") return env.APPDATA || join(home, "AppData", "Roaming");
  if (platform === "darwin") return join(home, "Library", "Application Support");
  return env.XDG_CONFIG_HOME || join(home, ".config");
}

/** The app's own config root — `$CCTRACE_CONFIG_DIR` when set (mirrors the
 * backend's `settings::config_root`; the e2e suite relies on it to keep test
 * runs away from real files), else `<config dir>/claude-code-trace`. */
export function appConfigRoot(opts = {}) {
  const override = ((opts.env ?? process.env).CCTRACE_CONFIG_DIR ?? "").trim();
  return override || join(configDir(opts), "claude-code-trace");
}

/** `<config root>/clients/web-ui.jwt` — written by the backend, read here. */
export function webUiCredentialPath(opts = {}) {
  return join(appConfigRoot(opts), "clients", `${WEB_UI_CLIENT}.jwt`);
}

/**
 * The credential the web UI should send, or `null` when verification is off
 * (`CCTRACE_API_AUTH=off`) or the backend has not written the file yet.
 * Never creates anything.
 */
export function readWebUiCredential(opts = {}) {
  const env = opts.env ?? process.env;
  if ((env.CCTRACE_API_AUTH ?? "").trim().toLowerCase() === "off") return null;
  try {
    const credential = readFileSync(webUiCredentialPath({ ...opts, env }), "utf8").trim();
    return credential || null;
  } catch {
    return null;
  }
}
