"""Tests for auth — how the TUI finds its own client credential."""

from __future__ import annotations

from pathlib import Path

import auth


def test_config_dir_linux_prefers_xdg_config_home():
    assert auth.config_dir("linux", {"XDG_CONFIG_HOME": "/xdg"}, Path("/h")) == Path("/xdg")


def test_config_dir_linux_falls_back_to_dot_config():
    assert auth.config_dir("linux", {}, Path("/h")) == Path("/h/.config")


def test_config_dir_darwin_uses_application_support():
    assert auth.config_dir("darwin", {}, Path("/Users/x")) == Path(
        "/Users/x/Library/Application Support"
    )


def test_config_dir_windows_uses_appdata_with_fallback():
    assert auth.config_dir("win32", {"APPDATA": "C:/appdata"}, Path("C:/u")) == Path("C:/appdata")
    assert auth.config_dir("win32", {}, Path("/u")) == Path("/u/AppData/Roaming")


def test_credential_path_is_clients_tui_jwt_inside_app_config_dir():
    assert auth.credential_path("linux", {}, Path("/h")) == Path(
        "/h/.config/claude-code-trace/clients/tui.jwt"
    )


def test_app_config_root_honours_override_env():
    env = {"CCTRACE_CONFIG_DIR": " /e2e/cfg ", "XDG_CONFIG_HOME": "/ignored"}
    assert auth.app_config_root("linux", env, Path("/h")) == Path("/e2e/cfg")
    assert auth.credential_path("linux", env, Path("/h")) == Path("/e2e/cfg/clients/tui.jwt")
    assert auth.app_config_root("linux", {"CCTRACE_CONFIG_DIR": "  "}, Path("/h")) == Path(
        "/h/.config/claude-code-trace"
    )


def test_resolve_env_off_wins(tmp_path: Path):
    p = tmp_path / "tui.jwt"
    p.write_text("eyJ.file.sig\n")
    assert auth.resolve_credential({"CCTRACE_API_AUTH": " OFF "}, p) is None


def test_resolve_ignores_removed_shared_token_env(tmp_path: Path):
    # `CCTRACE_API_TOKEN` was the pre-0.15 shared secret; it must not be
    # mistaken for a credential now that every client has its own.
    p = tmp_path / "tui.jwt"
    p.write_text("eyJ.file.sig\n")
    assert auth.resolve_credential({"CCTRACE_API_TOKEN": "legacy"}, p) == "eyJ.file.sig"


def test_resolve_reads_and_strips_file(tmp_path: Path):
    p = tmp_path / "tui.jwt"
    p.write_text("  eyJ.abc.def \n")
    assert auth.resolve_credential({}, p) == "eyJ.abc.def"


def test_resolve_missing_or_empty_file_is_none(tmp_path: Path):
    assert auth.resolve_credential({}, tmp_path / "missing") is None
    empty = tmp_path / "empty"
    empty.write_text("\n")
    assert auth.resolve_credential({}, empty) is None


def test_resolve_defaults_to_config_dir_path(tmp_path: Path, monkeypatch):
    cred_file = tmp_path / "claude-code-trace" / "clients" / "tui.jwt"
    cred_file.parent.mkdir(parents=True)
    cred_file.write_text("fromdefault\n")
    monkeypatch.setattr(auth.sys, "platform", "linux")
    assert auth.resolve_credential({"XDG_CONFIG_HOME": str(tmp_path)}) == "fromdefault"


def test_resolve_never_creates_the_file(tmp_path: Path):
    p = tmp_path / "clients" / "tui.jwt"
    assert auth.resolve_credential({}, p) is None
    assert not p.exists()
    assert not p.parent.exists()


def test_auth_headers_uses_explicit_credential():
    assert auth.auth_headers("t") == {"X-CCTrace-Token": "t"}


def test_auth_headers_empty_without_credential(monkeypatch):
    monkeypatch.setattr(auth, "resolve_credential", lambda: None)
    assert auth.auth_headers() == {}


def test_auth_headers_resolves_when_no_credential_given(monkeypatch):
    monkeypatch.setattr(auth, "resolve_credential", lambda: "resolved")
    assert auth.auth_headers() == {"X-CCTrace-Token": "resolved"}
