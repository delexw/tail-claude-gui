/**
 * Safe wrapper around Tauri's `listen`.
 *
 * In the Tauri webview it delegates to the real event system.
 * In a plain browser it subscribes to the Rust backend's SSE endpoint.
 */
import { listen as tauriListen } from "@tauri-apps/api/event";
import { isTauri } from "./isTauri";
import { API_BASE } from "./config";

export type UnlistenFn = () => void;

/** Shared SSE connection — lazily created, ref-counted. */
let sseSource: EventSource | null = null;
let sseRefCount = 0;

function ensureSse(): EventSource {
  if (!sseSource || sseSource.readyState === EventSource.CLOSED) {
    sseSource = new EventSource(`${API_BASE}/api/events`);
  }
  sseRefCount++;
  return sseSource;
}

function releaseSse(): void {
  sseRefCount--;
  if (sseRefCount <= 0 && sseSource) {
    sseSource.close();
    sseSource = null;
    sseRefCount = 0;
  }
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    return tauriListen<T>(event, handler);
  }

  const source = ensureSse();
  const onMessage = (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data) as T;
      handler({ payload });
    } catch {
      // ignore malformed events
    }
  };
  source.addEventListener(event, onMessage as EventListener);

  return () => {
    source.removeEventListener(event, onMessage as EventListener);
    releaseSse();
  };
}
