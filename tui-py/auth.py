"""The TUI's HTTP API client credential.

The Rust backend (``src-tauri/src/auth.rs``) requires every ``/api/*`` request
to carry the signed credential of a registered client, so it knows *who* is
calling. The TUI is one of the two built-in clients (``tui``; the browser UI is
``web-ui``): the backend registers it on first start and writes its credential
to ``<config root>/clients/tui.jwt`` for this module to read. Only the backend
can mint credentials (it holds the signing key), so nothing here ever creates
or writes a file.

Resolution:

1. ``CCTRACE_API_AUTH=off`` → no credential (verification disabled)
2. ``<config root>/clients/tui.jwt`` → read it

``auth_headers()`` re-resolves on every call, so a ``tui`` credential reissued
from Settings → Accepted clients is picked up on the TUI's next request
without a restart.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from pathlib import Path

TOKEN_HEADER = "X-CCTrace-Token"
ENV_AUTH = "CCTRACE_API_AUTH"
ENV_CONFIG_DIR = "CCTRACE_CONFIG_DIR"
CLIENT_NAME = "tui"


def config_dir(
    platform: str | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    """Mirror of Rust's ``dirs::config_dir()`` for the three supported platforms."""
    platform = sys.platform if platform is None else platform
    env = os.environ if env is None else env
    home = Path.home() if home is None else home
    if platform.startswith("win"):
        appdata = env.get("APPDATA")
        return Path(appdata) if appdata else home / "AppData" / "Roaming"
    if platform == "darwin":
        return home / "Library" / "Application Support"
    xdg = env.get("XDG_CONFIG_HOME")
    return Path(xdg) if xdg else home / ".config"


def app_config_root(
    platform: str | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    """The app's config root: ``$CCTRACE_CONFIG_DIR`` when set (mirrors the backend's
    ``settings::config_root``), else ``<config dir>/claude-code-trace``."""
    env = os.environ if env is None else env
    override = env.get(ENV_CONFIG_DIR, "").strip()
    if override:
        return Path(override)
    return config_dir(platform, env, home) / "claude-code-trace"


def credential_path(
    platform: str | None = None,
    env: Mapping[str, str] | None = None,
    home: Path | None = None,
) -> Path:
    """``<config root>/clients/tui.jwt`` — written by the backend, read here."""
    return app_config_root(platform, env, home) / "clients" / f"{CLIENT_NAME}.jwt"


def resolve_credential(
    env: Mapping[str, str] | None = None, path: Path | None = None
) -> str | None:
    """The credential to present, or ``None`` when disabled or not (yet) written."""
    env = os.environ if env is None else env
    if env.get(ENV_AUTH, "").strip().lower() == "off":
        return None
    path = credential_path(env=env) if path is None else path
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def auth_headers(credential: str | None = None) -> dict[str, str]:
    """Headers to send with every backend call (empty when no credential applies)."""
    cred = resolve_credential() if credential is None else credential
    return {TOKEN_HEADER: cred} if cred else {}
