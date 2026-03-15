/**
 * Safe wrapper around Tauri's `invoke`.
 *
 * In the Tauri webview it delegates to the real IPC bridge.
 * In a plain browser it provides localStorage-backed fallbacks for
 * settings commands so the app remains functional during `npm run dev`.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { isTauri } from "./isTauri";

const STORAGE_KEY = "cct_projects_dir";

function defaultDir(): string {
  return "~/.claude/projects";
}

/** Web-mode handler for known Tauri commands. */
function webInvoke<T>(cmd: string, args?: Record<string, unknown>): T {
  switch (cmd) {
    case "get_settings": {
      const stored = localStorage.getItem(STORAGE_KEY);
      return {
        projects_dir: stored,
        default_dir: defaultDir(),
      } as T;
    }
    case "set_projects_dir": {
      const path = (args?.path as string | null) ?? null;
      if (path) {
        localStorage.setItem(STORAGE_KEY, path);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return {
        projects_dir: path,
        default_dir: defaultDir(),
      } as T;
    }
    case "get_project_dirs": {
      const dir = localStorage.getItem(STORAGE_KEY) ?? defaultDir();
      return [dir] as T;
    }
    // Commands that require the Rust backend — return empty/no-op
    case "discover_sessions":
      return [] as T;
    case "watch_session":
    case "unwatch_session":
    case "watch_picker":
    case "unwatch_picker":
      return undefined as T;
    default:
      throw new Error(`[web] Tauri command "${cmd}" is not available in browser mode`);
  }
}

/**
 * Drop-in replacement for `import { invoke } from "@tauri-apps/api/core"`.
 * Works in both Tauri and plain-browser environments.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    return tauriInvoke<T>(cmd, args);
  }
  return webInvoke<T>(cmd, args);
}
