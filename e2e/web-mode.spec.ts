/**
 * `cctrace --web` shape: the Vite dev server serves the UI on one origin and
 * the backend answers on another. No cookie can help here — the Vite plugin
 * reads the shared token file and injects it, and the UI sends it as a header
 * on fetch calls and as a query parameter on the EventSource stream.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { E2E } from "../playwright.config";
import {
  expectSecretOnTestPath,
  FIXTURE_FIRST_MESSAGE,
  openSettings,
  readToken,
  regenerateToken,
  waitForInjectedToken,
} from "./helpers";

const { apiPort, configDir } = E2E.webMode;
const api = `http://127.0.0.1:${apiPort}`;

test("Vite plugin and backend converged on one token, sent as a header", async ({ page }) => {
  const firstApiCall = page.waitForRequest(
    (r) => r.url().startsWith(`${api}/api/`) && !r.url().includes("/api/events"),
  );
  await page.goto("/");
  const req = await firstApiCall;
  expect(req.headers()["x-cctrace-token"]).toBe(readToken(configDir));
  await expect(page.getByText(FIXTURE_FIRST_MESSAGE)).toBeVisible();
});

test("SSE stream carries the token as a query parameter", async ({ page }) => {
  const sse = page.waitForRequest((r) => r.url().startsWith(`${api}/api/events`));
  await page.goto("/");
  const url = new URL((await sse).url());
  expect(url.searchParams.get("token")).toBe(readToken(configDir));
});

test("Regenerate hot-swaps the token in this tab — no reload — and SSE + fetch follow", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  await expect(page.getByText(FIXTURE_FIRST_MESSAGE)).toBeVisible();
  const oldToken = readToken(configDir);
  let loads = 0;
  page.on("load", () => loads++);

  const reconnected = page.waitForRequest(
    (r) => r.url().startsWith(`${api}/api/events`) && !r.url().includes(oldToken),
  );
  await openSettings(page);
  const newToken = await regenerateToken(page);
  expect(newToken).not.toBe(oldToken);
  expect(readToken(configDir)).toBe(newToken);
  expectSecretOnTestPath(configDir);

  // listen.ts reopens the stream with the rotated token, without a reload.
  expect(new URL((await reconnected).url()).searchParams.get("token")).toBe(newToken);

  // The plugin hot-swaps the virtual token module over HMR when the file
  // changes. Wait for the dev server to serve the rotated value, then prove
  // the page was NOT reloaded meanwhile: the Settings modal the user clicked
  // in is still open, showing the new token. (The dev server used to restart
  // here, and Vite's client full-reloaded the page — exactly what CI caught.)
  await waitForInjectedToken(baseURL!, newToken);
  expect(loads).toBe(0);
  await expect(page.getByLabel("API token")).toHaveValue(newToken);
  await expect(page.getByText(/Token regenerated/)).toBeVisible();

  // A cold load authenticates with the rotated token straight away.
  const nextFetch = page.waitForRequest(
    (r) => r.url().startsWith(`${api}/api/`) && !r.url().includes("/api/events"),
  );
  await page.goto("/");
  expect((await nextFetch).headers()["x-cctrace-token"]).toBe(newToken);
  await expect(page.getByText(FIXTURE_FIRST_MESSAGE)).toBeVisible();
});

test("a rotation by another process reaches an open tab over HMR", async ({ page, baseURL }) => {
  await page.goto("/");
  await expect(page.getByText(FIXTURE_FIRST_MESSAGE)).toBeVisible();
  const oldToken = readToken(configDir);
  let loads = 0;
  page.on("load", () => loads++);

  // Rotate from outside the browser, the way a second cctrace process (or
  // `Regenerate` in another tab) would: rewrite the file the backend owns.
  // The backend adopts it on the next mismatch; the dev server pushes it to
  // this tab; the tab's SSE stream must come back on the new token.
  const reconnected = page.waitForRequest(
    (r) => r.url().startsWith(`${api}/api/events`) && !r.url().includes(oldToken),
  );
  const rotated = `${"e".repeat(32)}${Date.now().toString(16).padStart(32, "0")}`;
  writeFileSync(join(configDir, "api-token"), `${rotated}\n`);

  expect(new URL((await reconnected).url()).searchParams.get("token")).toBe(rotated);
  await waitForInjectedToken(baseURL!, rotated);
  expect(loads).toBe(0);

  // …and the API accepts the tab's next call with the rotated token.
  const nextFetch = page.waitForRequest(
    (r) => r.url().startsWith(`${api}/api/`) && !r.url().includes("/api/events"),
  );
  await page.getByTitle("Settings").click();
  const req = await nextFetch;
  expect(req.headers()["x-cctrace-token"]).toBe(rotated);
  expect((await req.response())?.status()).toBe(200);
});
