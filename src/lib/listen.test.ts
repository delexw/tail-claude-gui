import { describe, it, expect, vi, beforeEach } from "vitest";

describe("listen (web/SSE mode)", () => {
  let mockSource: {
    readyState: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Reset module-level SSE state by clearing the module cache.
    vi.resetModules();

    mockSource = {
      readyState: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };

    // EventSource must be a constructor (class), not a plain function.
    vi.stubGlobal(
      "EventSource",
      class {
        static CLOSED = 2;
        readyState = mockSource.readyState;
        addEventListener = mockSource.addEventListener;
        removeEventListener = mockSource.removeEventListener;
        close = mockSource.close;
      },
    );
  });

  it("creates an EventSource and registers event listener", async () => {
    const { listen } = await import("./listen");
    const handler = vi.fn();
    const unlisten = await listen("session-update", handler);

    expect(mockSource.addEventListener).toHaveBeenCalledWith(
      "session-update",
      expect.any(Function),
    );
    expect(typeof unlisten).toBe("function");
  });

  it("unlisten removes the event listener", async () => {
    const { listen } = await import("./listen");
    const unlisten = await listen("test-event", () => {});
    unlisten();

    expect(mockSource.removeEventListener).toHaveBeenCalledWith("test-event", expect.any(Function));
  });
});
