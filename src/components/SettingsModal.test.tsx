import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal";

const mockInvoke = vi.fn();
vi.mock("../lib/invoke", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const DEFAULT_DIR = "/Users/x/.claude/projects";

describe("SettingsModal", () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_settings")
        return Promise.resolve({ projects_dir: null, default_dir: DEFAULT_DIR });
      if (cmd === "set_projects_dir")
        return Promise.resolve({ projects_dir: null, default_dir: DEFAULT_DIR });
      return Promise.resolve();
    });
  });

  it("pre-fills input with default dir when no config exists", async () => {
    render(<SettingsModal onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue(DEFAULT_DIR)).toBeInTheDocument();
    });
    expect(screen.getByText(`Default: ${DEFAULT_DIR}`)).toBeInTheDocument();
  });

  it("shows current configured path when one exists", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_settings")
        return Promise.resolve({ projects_dir: "/custom/path", default_dir: DEFAULT_DIR });
      return Promise.resolve();
    });
    render(<SettingsModal onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("/custom/path")).toBeInTheDocument();
    });
  });

  it("calls set_projects_dir on save", async () => {
    render(<SettingsModal onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByDisplayValue(DEFAULT_DIR)).toBeInTheDocument());

    const input = screen.getByLabelText("Projects Directory");
    fireEvent.change(input, { target: { value: "/new/path" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_projects_dir", { path: "/new/path" });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls set_projects_dir with null on reset", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_settings")
        return Promise.resolve({ projects_dir: "/custom/path", default_dir: DEFAULT_DIR });
      if (cmd === "set_projects_dir")
        return Promise.resolve({ projects_dir: null, default_dir: DEFAULT_DIR });
      return Promise.resolve();
    });
    render(<SettingsModal onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByDisplayValue("/custom/path")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Reset to Default"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_projects_dir", { path: null });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error when save fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_settings")
        return Promise.resolve({ projects_dir: null, default_dir: DEFAULT_DIR });
      if (cmd === "set_projects_dir") return Promise.reject("path does not exist: /bad");
      return Promise.resolve();
    });
    render(<SettingsModal onClose={onClose} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByDisplayValue(DEFAULT_DIR)).toBeInTheDocument());

    const input = screen.getByLabelText("Projects Directory");
    fireEvent.change(input, { target: { value: "/bad" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("path does not exist: /bad")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
