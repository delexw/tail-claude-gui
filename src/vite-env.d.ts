/// <reference types="vite/client" />

/** Served by the `cctrace-api-token` plugin in `vite.config.ts`: the shared
 * HTTP API client token while the dev server runs, `""` in production builds
 * (Docker uses a cookie instead) and under vitest. */
declare module "virtual:cctrace-api-token" {
  const token: string;
  export default token;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
