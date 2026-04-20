/**
 * Shared configuration for the web fallback layer.
 *
 * `API_BASE` is the origin used to reach the Rust HTTP backend from the
 * browser. The default points at the local desktop/dev backend.
 *
 * Override at build time with `VITE_API_BASE`:
 *   - `VITE_API_BASE=""` → empty string, same-origin (used by the Docker
 *     image where backend and frontend are served from one port).
 *   - `VITE_API_BASE="https://example.com"` → custom remote backend.
 */
const envBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? undefined;

export const API_BASE = envBase ?? "http://127.0.0.1:11423";
