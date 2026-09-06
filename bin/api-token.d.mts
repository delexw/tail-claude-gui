/** Type declarations for `api-token.mjs` so `vite.config.ts` can import it under `strict`. */
export interface ApiTokenOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
}
export const WEB_UI_CLIENT: "web-ui";
export function configDir(opts?: ApiTokenOptions): string;
export function appConfigRoot(opts?: ApiTokenOptions): string;
export function webUiCredentialPath(opts?: ApiTokenOptions): string;
export function readWebUiCredential(opts?: ApiTokenOptions): string | null;
