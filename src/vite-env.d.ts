/// <reference types="vite/client" />

/** Served by the `cctrace-api-token` plugin in `vite.config.ts`: the `web-ui`
 * client's credential while the dev server runs, `""` in production builds
 * (Docker uses a cookie instead) and under vitest. */
declare module "virtual:cctrace-api-token" {
  const credential: string;
  export default credential;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
