import { describe, it, expect, beforeEach } from "vitest";

// Tests run in jsdom (no __TAURI_INTERNALS__), so web fallbacks are used.

describe("invoke (web mode)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("get_settings returns default when nothing stored", async () => {
    const { invoke } = await import("./invoke");
    const res = await invoke<{ projects_dir: string | null; default_dir: string }>("get_settings");
    expect(res.projects_dir).toBeNull();
    expect(res.default_dir).toContain(".claude/projects");
  });

  it("set_projects_dir persists to localStorage", async () => {
    const { invoke } = await import("./invoke");
    await invoke("set_projects_dir", { path: "/custom/dir" });
    const res = await invoke<{ projects_dir: string | null }>("get_settings");
    expect(res.projects_dir).toBe("/custom/dir");
  });

  it("set_projects_dir with null clears storage", async () => {
    const { invoke } = await import("./invoke");
    await invoke("set_projects_dir", { path: "/custom/dir" });
    await invoke("set_projects_dir", { path: null });
    const res = await invoke<{ projects_dir: string | null }>("get_settings");
    expect(res.projects_dir).toBeNull();
  });

  it("get_project_dirs returns array with stored dir", async () => {
    const { invoke } = await import("./invoke");
    await invoke("set_projects_dir", { path: "/my/projects" });
    const dirs = await invoke<string[]>("get_project_dirs");
    expect(dirs).toEqual(["/my/projects"]);
  });

  it("discover_sessions returns empty array", async () => {
    const { invoke } = await import("./invoke");
    const sessions = await invoke<unknown[]>("discover_sessions", { projectDirs: ["/a"] });
    expect(sessions).toEqual([]);
  });

  it("watch/unwatch commands resolve without error", async () => {
    const { invoke } = await import("./invoke");
    await expect(invoke("watch_session", { path: "/a" })).resolves.toBeUndefined();
    await expect(invoke("unwatch_session")).resolves.toBeUndefined();
    await expect(invoke("watch_picker", { projectDirs: [] })).resolves.toBeUndefined();
    await expect(invoke("unwatch_picker")).resolves.toBeUndefined();
  });

  it("unknown command throws", async () => {
    const { invoke } = await import("./invoke");
    await expect(invoke("nonexistent_cmd")).rejects.toThrow("not available in browser mode");
  });
});
