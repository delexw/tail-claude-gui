import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollToSelected } from "./useScrollToSelected";

describe("useScrollToSelected", () => {
  it("returns a ref object", () => {
    const { result } = renderHook(() => useScrollToSelected(0));
    expect(result.current).toHaveProperty("current");
  });

  it("calls scrollIntoView when dep changes", () => {
    const scrollIntoView = vi.fn();
    const getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 200,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
    }));
    const { result, rerender } = renderHook(({ dep }) => useScrollToSelected(dep), {
      initialProps: { dep: 0 },
    });

    // Attach a mock element to the ref
    Object.defineProperty(result.current, "current", {
      value: { scrollIntoView, getBoundingClientRect, offsetHeight: 100 },
      writable: true,
    });

    // Change dep to trigger the effect
    rerender({ dep: 1 });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not throw when ref.current is null", () => {
    const { rerender } = renderHook(({ dep }) => useScrollToSelected(dep), {
      initialProps: { dep: 0 },
    });

    // ref.current is null by default; should not throw
    expect(() => rerender({ dep: 1 })).not.toThrow();
  });
});
