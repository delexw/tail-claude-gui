import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { dirname } from "node:path";
import { readWebUiCredential, webUiCredentialPath } from "./bin/api-token.mjs";

const host = process.env.TAURI_DEV_HOST;

/**
 * Hand the browser UI its client credential in dev/web mode.
 *
 * `cctrace --web` serves the UI from Vite (port 1420) while the Rust API
 * listens on 11423, so the browser can't get the credential as a same-origin
 * cookie the way the Docker bundle does. This plugin reads the built-in
 * `web-ui` client's credential the backend writes to
 * `<config root>/clients/web-ui.jwt` — see `bin/api-token.mjs` — and serves it
 * as the virtual module `virtual:cctrace-api-token`, imported by
 * `src/lib/apiToken.ts`. The plugin never creates the file: only the backend
 * holds the signing key.
 *
 * Two properties are load-bearing:
 * - In a production/Docker `vite build` the module is `""` — a bundle must
 *   never contain a credential.
 * - When the file appears or changes on disk (first backend start, or
 *   Settings → Accepted clients → Reissue `web-ui`, from this tab or another
 *   cctrace process), the module is invalidated and pushed over HMR.
 *   `apiToken.ts` accepts that update, so open tabs adopt the new credential
 *   in place. It must NOT restart the dev server: a restart makes Vite's
 *   client full-reload the page, which tears down the Settings modal the user
 *   just clicked in.
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
      // Re-read on every (re)load so an invalidation after a reissue serves
      // the current file contents.
      const credential = serving ? (readWebUiCredential() ?? "") : "";
      return `export default ${JSON.stringify(credential)};`;
    },
    configureServer(server) {
      const path = webUiCredentialPath();
      // Watch the directory too: on a first run the file does not exist yet
      // (the backend creates it moments after Vite starts).
      server.watcher.add([path, dirname(path)]);
      const onCredentialFile = (changed: string) => {
        if (changed !== path) return;
        const mod = server.moduleGraph.getModuleById(API_TOKEN_MODULE_ID);
        if (mod) void server.reloadModule(mod);
      };
      // Reissue replaces the file via rename, which some watchers report as
      // add rather than change.
      server.watcher.on("change", onCredentialFile);
      server.watcher.on("add", onCredentialFile);
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
