import { describe, it, expect } from "vitest";

describe("listen (web mode)", () => {
  it("returns a no-op unlisten function", async () => {
    const { listen } = await import("./listen");
    const unlisten = await listen("test-event", () => {});
    expect(typeof unlisten).toBe("function");
    // Should not throw
    unlisten();
  });
});
