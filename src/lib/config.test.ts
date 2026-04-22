import { describe, it, expect } from "vitest";
import { API_BASE } from "./config";

describe("config", () => {
  it("falls back to the default localhost backend when VITE_API_BASE is unset", () => {
    // Vitest does not set VITE_API_BASE by default, so API_BASE is the fallback.
    expect(API_BASE).toBe("http://127.0.0.1:11423");
  });
});
