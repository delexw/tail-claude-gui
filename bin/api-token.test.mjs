import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", () => {
  const platform = vi.fn(() => "linux");
  const homedir = vi.fn(() => "/home/u");
  return { platform, homedir, default: { platform, homedir } };
});
vi.mock("node:fs", () => {
  const fns = { readFileSync: vi.fn(), writeFileSync: vi.fn(), mkdirSync: vi.fn() };
  return { ...fns, default: fns };
});

const { platform } = await import("node:os");
const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
const { configDir, appConfigRoot, webUiCredentialPath, readWebUiCredential } =
  await import("./api-token.mjs");

const enoent = () => {
  const e = new Error("ENOENT");
  e.code = "ENOENT";
  throw e;
};

beforeEach(() => {
  vi.clearAllMocks();
  platform.mockReturnValue("linux");
  readFileSync.mockImplementation(enoent);
});

describe("configDir", () => {
  it("uses XDG_CONFIG_HOME on linux when set", () => {
    expect(configDir({ platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" }, home: "/h" })).toBe(
      "/xdg",
    );
  });

  it("falls back to ~/.config on linux", () => {
    expect(configDir({ platform: "linux", env: {}, home: "/h" })).toBe("/h/.config");
  });

  it("uses ~/Library/Application Support on darwin", () => {
    expect(configDir({ platform: "darwin", env: {}, home: "/Users/x" })).toBe(
      "/Users/x/Library/Application Support",
    );
  });

  it("uses APPDATA on win32, falling back to AppData/Roaming", () => {
    expect(configDir({ platform: "win32", env: { APPDATA: "C:/appdata" }, home: "C:/u" })).toBe(
      "C:/appdata",
    );
    // join() on this (posix) test host uses "/" separators; only the tail matters.
    expect(configDir({ platform: "win32", env: {}, home: "/u" })).toBe("/u/AppData/Roaming");
  });

  it("defaults to the running platform and home", () => {
    expect(configDir({ env: {} })).toBe("/home/u/.config");
  });
});

describe("webUiCredentialPath", () => {
  it("is clients/web-ui.jwt inside the app's config dir", () => {
    expect(webUiCredentialPath({ platform: "linux", env: {}, home: "/h" })).toBe(
      "/h/.config/claude-code-trace/clients/web-ui.jwt",
    );
  });

  it("honours CCTRACE_CONFIG_DIR as the whole config root", () => {
    const env = { CCTRACE_CONFIG_DIR: " /e2e/cfg ", XDG_CONFIG_HOME: "/ignored" };
    expect(appConfigRoot({ platform: "linux", env, home: "/h" })).toBe("/e2e/cfg");
    expect(webUiCredentialPath({ platform: "linux", env, home: "/h" })).toBe(
      "/e2e/cfg/clients/web-ui.jwt",
    );
    // Blank override falls through to the OS location.
    expect(
      appConfigRoot({ platform: "linux", env: { CCTRACE_CONFIG_DIR: "  " }, home: "/h" }),
    ).toBe("/h/.config/claude-code-trace");
  });
});

describe("readWebUiCredential", () => {
  const opts = { platform: "linux", home: "/h" };
  const path = "/h/.config/claude-code-trace/clients/web-ui.jwt";

  it("returns null when CCTRACE_API_AUTH=off, without touching the file", () => {
    expect(readWebUiCredential({ ...opts, env: { CCTRACE_API_AUTH: " OFF " } })).toBeNull();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("reads and trims the credential file", () => {
    readFileSync.mockReturnValue("  eyJ.abc.def \n");
    expect(readWebUiCredential({ ...opts, env: {} })).toBe("eyJ.abc.def");
    expect(readFileSync).toHaveBeenCalledWith(path, "utf8");
  });

  it("returns null when the backend has not written the file yet", () => {
    expect(readWebUiCredential({ ...opts, env: {} })).toBeNull();
  });

  it("returns null for an empty file", () => {
    readFileSync.mockReturnValue("\n");
    expect(readWebUiCredential({ ...opts, env: {} })).toBeNull();
  });

  it("never creates or writes anything — only the backend mints credentials", () => {
    readWebUiCredential({ ...opts, env: {} });
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
  });
});
