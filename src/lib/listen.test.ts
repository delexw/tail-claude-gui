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

    constructedUrls = [];
    // EventSource must be a constructor (class), not a plain function.
    vi.stubGlobal(
      "EventSource",
      class {
        static CLOSED = 2;
        readyState = mockSource.readyState;
        addEventListener = mockSource.addEventListener;
        removeEventListener = mockSource.removeEventListener;
        close = mockSource.close;
        constructor(url: string) {
          constructedUrls.push(url);
        }
      },
    );
    const { setApiToken } = await import("./apiToken");
    setApiToken(null);
  });

  let constructedUrls: string[] = [];

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

  it("connects to /api/events without a token when none is set", async () => {
    const { listen } = await import("./listen");
    await listen("session-update", () => {});
    expect(constructedUrls).toEqual(["http://127.0.0.1:11423/api/events"]);
  });

  it("carries the API token in the query string (EventSource cannot set headers)", async () => {
    const { setApiToken } = await import("./apiToken");
    setApiToken("tok123");
    const { listen } = await import("./listen");
    await listen("session-update", () => {});
    expect(constructedUrls).toEqual(["http://127.0.0.1:11423/api/events?token=tok123"]);
  });

  it("reconnectSse closes the stream, reopens with the current token, and re-attaches listeners", async () => {
    const { setApiToken } = await import("./apiToken");
    const { listen, reconnectSse } = await import("./listen");
    setApiToken("tok");
    await listen("session-update", () => {});
    await listen("picker-refresh", () => {});
    expect(mockSource.addEventListener).toHaveBeenCalledTimes(2);

    reconnectSse();

    expect(mockSource.close).toHaveBeenCalledTimes(1);
    expect(constructedUrls).toEqual([
      "http://127.0.0.1:11423/api/events?token=tok",
      "http://127.0.0.1:11423/api/events?token=tok",
    ]);
    // Both listeners were re-registered on the replacement connection.
    expect(mockSource.addEventListener).toHaveBeenCalledTimes(4);
    expect(mockSource.addEventListener).toHaveBeenLastCalledWith(
      "picker-refresh",
      expect.any(Function),
    );
  });

  it("reconnectSse is a no-op when nothing is listening", async () => {
    const { reconnectSse } = await import("./listen");
    reconnectSse();
    expect(constructedUrls).toEqual([]);
    expect(mockSource.close).not.toHaveBeenCalled();
  });

  it("unlisten after reconnect detaches from the replacement connection and does not re-add it", async () => {
    const { listen, reconnectSse } = await import("./listen");
    const unlisten = await listen("session-update", () => {});
    reconnectSse();
    unlisten();
    expect(mockSource.removeEventListener).toHaveBeenCalledWith(
      "session-update",
      expect.any(Function),
    );
    // Refcount dropped to zero → connection closed (once for reconnect, once for release).
    expect(mockSource.close).toHaveBeenCalledTimes(2);
    // A later reconnect has nothing to re-attach and nothing open to replace.
    reconnectSse();
    expect(constructedUrls).toHaveLength(2);
  });

  it("reopens the stream with the new token when the live token changes", async () => {
    const { setApiToken } = await import("./apiToken");
    const { listen } = await import("./listen");
    setApiToken("before");
    await listen("session-update", () => {});
    expect(constructedUrls).toEqual(["http://127.0.0.1:11423/api/events?token=before"]);

    // A rotation — from Settings in this tab, or pushed over HMR because
    // another process rewrote the file — must not leave the stream on the
    // dead token.
    setApiToken("after");
    expect(mockSource.close).toHaveBeenCalledTimes(1);
    expect(constructedUrls).toEqual([
      "http://127.0.0.1:11423/api/events?token=before",
      "http://127.0.0.1:11423/api/events?token=after",
    ]);
    expect(mockSource.addEventListener).toHaveBeenCalledTimes(2);
  });

  it("ignores a token change when nothing is listening", async () => {
    const { setApiToken } = await import("./apiToken");
    await import("./listen");
    setApiToken("x");
    expect(constructedUrls).toEqual([]);
    expect(mockSource.close).not.toHaveBeenCalled();
  });
});
