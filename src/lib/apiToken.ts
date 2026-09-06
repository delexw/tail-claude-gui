/**
 * This browser tab's HTTP API client credential.
 *
 * The Rust backend gates every `/api/*` route behind a signed per-client
 * credential (see `src-tauri/src/auth.rs`); the browser frontend runs as the
 * built-in `web-ui` client. How this module learns the credential depends on
 * the mode:
 *
 * - `cctrace --web` (Vite on 1420, API on 11423): the `cctrace-api-token`
 *   plugin in `vite.config.ts` reads `clients/web-ui.jwt` and serves it as the
 *   virtual module imported below. `invoke.ts` sends it as an `X-CCTrace-Token`
 *   header; `listen.ts` appends it as `?token=` because `EventSource` cannot
 *   set headers. When the file changes on disk (Reissue, from this tab or any
 *   other process) the plugin pushes the new value over HMR and the
 *   `import.meta.hot.accept` below swaps it in — no dev-server restart, no
 *   page reload.
 * - Docker (same-origin bundle): the virtual module is `""` in production
 *   builds. The server sets an HttpOnly cookie carrying the `web-ui`
 *   credential on the HTML shell, which the browser attaches automatically.
 * - Tauri desktop: never used — the webview talks over IPC, not HTTP.
 *
 * Kept separate from `invoke.ts` / `listen.ts` so neither imports the other;
 * `listen.ts` subscribes via `onApiTokenChange` to reopen its stream.
 */
import injected from "virtual:cctrace-api-token";

type Listener = (token: string | null) => void;

let token: string | null = injected || null;
const listeners = new Set<Listener>();

/** The credential currently sent with HTTP API calls, or null when none is set. */
export function getApiToken(): string | null {
  return token;
}

/** Swap the live credential. Notifies subscribers only when the value
 * actually changes, so redundant sets (e.g. the HMR echo of a reissue this tab
 * performed itself) are free. */
export function setApiToken(next: string | null | undefined): void {
  const value = next || null;
  if (value === token) return;
  token = value;
  for (const listener of listeners) listener(value);
}

/** Be told whenever the live credential changes. Returns an unsubscribe function. */
export function onApiTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Headers to spread into a `fetch` call to the HTTP API. */
export function authHeaders(): Record<string, string> {
  return token ? { "X-CCTrace-Token": token } : {};
}

/** Append `token=` to a URL (for `EventSource`, which cannot set headers). */
export function withTokenQuery(url: string): string {
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

if (import.meta.hot) {
  // Dev server only: the plugin invalidates the virtual module when the
  // credential file changes; accepting that one dependency keeps this module
  // (and the page) alive and just adopts the new value.
  import.meta.hot.accept("virtual:cctrace-api-token", (mod) => {
    setApiToken((mod as { default?: string } | undefined)?.default);
  });
}
