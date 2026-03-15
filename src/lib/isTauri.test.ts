import { describe, it, expect } from "vitest";

describe("isTauri", () => {
  it("returns false when __TAURI_INTERNALS__ is absent", async () => {
    // vitest runs in jsdom which doesn't set __TAURI_INTERNALS__
    const mod = await import("./isTauri");
    expect(mod.isTauri).toBe(false);
  });
});
