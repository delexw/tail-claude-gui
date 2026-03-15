/**
 * Safe wrapper around Tauri's `listen`.
 *
 * In the Tauri webview it delegates to the real event system.
 * In a plain browser it returns a no-op unlisten function.
 */
import { listen as tauriListen } from "@tauri-apps/api/event";
import { isTauri } from "./isTauri";

export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  if (isTauri) {
    return tauriListen<T>(event, handler);
  }
  // In browser mode, events never fire — return a no-op cleanup
  return () => {};
}
