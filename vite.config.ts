import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { apiTokenPath, resolveApiToken } from "./bin/api-token.mjs";

const host = process.env.TAURI_DEV_HOST;

/**
 * Hand the browser UI the shared HTTP API client token in dev/web mode.
 *
 * `cctrace --web` serves the UI from Vite (port 1420) while the Rust API
 * listens on 11423, so the browser can't get the token as a same-origin
 * cookie the way the Docker bundle does. This plugin reads (or, on a first
 * run, creates) the same token file the backend uses — see
 * `bin/api-token.mjs` — and serves it as the virtual module
 * `virtual:cctrace-api-token`, imported by `src/lib/apiToken.ts`.
 *
 * Two properties are load-bearing:
 * - In a production/Docker `vite build` the module is `""` — a bundle must
 *   never contain a token.
 * - When the file changes on disk (Settings → Regenerate rewrites it, from
 *   this tab or another cctrace process), the module is invalidated and pushed
 *   over HMR. `apiToken.ts` accepts that update, so open tabs adopt the new
 *   token in place. It must NOT restart the dev server: a restart makes Vite's
 *   client full-reload the page, which tears down the Settings modal the user
 *   just clicked Regenerate in.
 */
const API_TOKEN_MODULE = "virtual:cctrace-api-token";
const API_TOKEN_MODULE_ID = `\0${API_TOKEN_MODULE}`;

function apiTokenPlugin(): Plugin {
  let serving = false;
  return {
    name: "cctrace-api-token",
    configResolved(config) {
      serving = config.command === "serve";
    },
    resolveId(id) {
      return id === API_TOKEN_MODULE ? API_TOKEN_MODULE_ID : undefined;
    },
    load(id) {
      if (id !== API_TOKEN_MODULE_ID) return undefined;
      // Re-read on every (re)load so an invalidation after a rotation serves
      // the current file contents.
      const token = serving ? (resolveApiToken() ?? "") : "";
      return `export default ${JSON.stringify(token)};`;
    },
    configureServer(server) {
      const path = apiTokenPath();
      server.watcher.add(path);
      const onTokenFile = (changed: string) => {
        if (changed !== path) return;
        const mod = server.moduleGraph.getModuleById(API_TOKEN_MODULE_ID);
        if (mod) void server.reloadModule(mod);
      };
      // Rotation replaces the file via rename, which some watchers report as
      // add rather than change.
      server.watcher.on("change", onTokenFile);
      server.watcher.on("add", onTokenFile);
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), apiTokenPlugin()],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: {
    // VITE_PORT allows headless/TUI mode to use a different port to avoid
    // conflicting with an already-running web/desktop Vite instance.
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 1420,
    strictPort: !process.env.VITE_PORT,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
