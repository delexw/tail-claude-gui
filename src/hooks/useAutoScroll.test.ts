import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { useAutoScroll } from "./useAutoScroll";

function mockScrollableElement(scrollTop: number, scrollHeight: number, clientHeight: number) {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  return el;
}

/**
 * Set up the hook with a mock element already attached.
 * Uses an existing ref so the element is available from the first render.
 */
function setup(el: HTMLElement, initialCount: number) {
  const refObj = { current: el as HTMLDivElement };
  const { rerender } = renderHook(
    ({ count }) => {
      const ref = useRef<HTMLDivElement>(el as HTMLDivElement);
      // Keep the ref in sync with our mock element
      ref.current = refObj.current as HTMLDivElement;
      useAutoScroll(count, ref);
      return ref;
    },
    { initialProps: { count: initialCount } },
  );
  return { el, rerender };
}

describe("useAutoScroll", () => {
  it("returns a ref", () => {
    const { result } = renderHook(() => useAutoScroll(0));
    expect(result.current).toHaveProperty("current");
  });

  it("auto-scrolls when item count increases and was near bottom", () => {
    // distance = 500 - 400 - 100 = 0 (at bottom)
    const el = mockScrollableElement(400, 500, 100);
    const { rerender } = setup(el, 1);

    rerender({ count: 2 });
    expect(el.scrollTop).toBe(500);
  });

  it("does not auto-scroll when user has scrolled up", () => {
    // distance = 1000 - 200 - 100 = 700 (far from bottom)
    const el = mockScrollableElement(200, 1000, 100);
    const { rerender } = setup(el, 1);

    // The useEffect runs checkNearBottom() on mount → isNearBottom = false
    rerender({ count: 2 });
    expect(el.scrollTop).toBe(200);
  });

  it("does not auto-scroll when count stays the same", () => {
    const el = mockScrollableElement(400, 500, 100);
    const { rerender } = setup(el, 3);

    rerender({ count: 3 });
    expect(el.scrollTop).toBe(400);
  });

  it("works with an existing ref passed in", () => {
    const el = mockScrollableElement(400, 500, 100);
    const refObj = { current: el as HTMLDivElement };
    const { rerender } = renderHook(
      ({ count }) => {
        const ref = useRef<HTMLDivElement>(el as HTMLDivElement);
        ref.current = refObj.current as HTMLDivElement;
        useAutoScroll(count, ref);
        return ref;
      },
      { initialProps: { count: 1 } },
    );

    rerender({ count: 2 });
    expect(el.scrollTop).toBe(500);
  });

  it("defaults to near-bottom on initial render (no scroll event yet)", () => {
    const { result, rerender } = renderHook(({ count }) => useAutoScroll<HTMLDivElement>(count), {
      initialProps: { count: 1 },
    });

    const el = mockScrollableElement(0, 500, 500);
    Object.defineProperty(result.current, "current", { value: el, writable: true });

    // No scroll listener attached yet — defaults to "near bottom"
    rerender({ count: 2 });
    expect(el.scrollTop).toBe(500);
  });

  it("auto-scrolls even when new content adds significant height", () => {
    // Start at bottom: distance = 500 - 400 - 100 = 0
    const el = mockScrollableElement(400, 500, 100);
    const { rerender } = setup(el, 1);

    // Simulate new content pushing scrollHeight to 2000.
    // Old approach: distance = 2000-400-100 = 1500 > 150 → would NOT scroll.
    // New approach: near-bottom was captured before content grew → DOES scroll.
    Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });

    rerender({ count: 2 });
    expect(el.scrollTop).toBe(2000);
  });

  it("resumes auto-scroll when user scrolls back to bottom", () => {
    // Start far from bottom
    const el = mockScrollableElement(200, 1000, 100);
    const { rerender } = setup(el, 1);

    // Should not scroll (far from bottom)
    rerender({ count: 2 });
    expect(el.scrollTop).toBe(200);

    // User scrolls to bottom
    Object.defineProperty(el, "scrollTop", { value: 900, writable: true, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
    act(() => el.dispatchEvent(new Event("scroll")));

    rerender({ count: 3 });
    expect(el.scrollTop).toBe(1000);
  });
});
