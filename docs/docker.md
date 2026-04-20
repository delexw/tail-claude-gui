# Running Claude Code Trace in Docker

This guide walks through running the web UI inside a Docker container. The
image bundles both the Rust backend and the static React frontend behind a
single HTTP port, and reads your Claude Code sessions from a mounted volume.

> **Scope.** Docker is only supported for **web mode**. The desktop (Tauri)
> and TUI modes require OS-level integrations (native windowing, ttys) that
> don't translate well to containers. If you need the desktop app, install
> from source or grab a pre-built release instead.

## Prerequisites

- Docker 20.10+ (or Docker Desktop / Podman / OrbStack equivalent)
- Your host has Claude Code sessions under `~/.claude/projects`

## Quick start

```bash
# Build
docker build -t claude-code-trace .

# Run — expose port 8080, mount ~/.claude read-only
docker run --rm \
  -p 8080:8080 \
  -v "$HOME/.claude:/home/app/.claude:ro" \
  claude-code-trace
```

Open http://localhost:8080 in a browser. The session picker will populate
from the mounted directory.

Press `Ctrl-C` to stop the container.

## docker compose

A `docker-compose.yml` is included for convenience:

```bash
docker compose up --build
```

To change the host port or the Claude data location, set env vars:

```bash
CCTRACE_HOST_PORT=9090 CLAUDE_HOME=/srv/claude docker compose up
```

## Runtime configuration

All runtime knobs are environment variables, so you can override them with
`-e VAR=value` on `docker run` or under `environment:` in compose.

| Variable             | Default     | What it does                                 |
| -------------------- | ----------- | -------------------------------------------- |
| `CCTRACE_HTTP_HOST`  | `0.0.0.0`   | Bind host for the HTTP server                |
| `CCTRACE_HTTP_PORT`  | `8080`      | Bind port for the HTTP server                |
| `CCTRACE_STATIC_DIR` | `/app/dist` | Directory of static frontend assets to serve |

Outside Docker (i.e. the normal desktop/web app) these variables are not
set, and the server falls back to the historical defaults
(`127.0.0.1:11423`, no static assets). So adding these vars has no effect on
native installations.

## Volumes

| Container path      | Purpose                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `/home/app/.claude` | Source of session JSONL files (mount your host's `~/.claude` here) |

The app only needs to **read** session logs, so mounting read-only (`:ro`)
is recommended and is what the shipped `docker-compose.yml` does.

If you keep session logs somewhere other than `~/.claude/projects` — e.g.
`/srv/claude` — mount that directory instead, or point the app at a
different `projectsDir` via the Settings UI (the chosen path is remembered
in `XDG_CONFIG_HOME/claude-code-trace/settings.json`, which lives inside
`/home/app/.config` in the image).

## Networking model

The container runs a single axum HTTP server that:

1. Serves `/api/*` — the JSON + Server-Sent Events backend.
2. Serves everything else from `/app/dist` — the compiled React bundle
   (including SPA deep-link support via `append_index_html_on_directories`).

The frontend is built with `VITE_API_BASE=""`, which makes it use
same-origin relative URLs. Nothing in the container talks to `localhost`
from the browser's perspective, so you only need to expose **one port**.

## Under the hood

Tauri v2's webview runtime links against `libwebkit2gtk-4.1-0` on Linux,
which needs an X display even when no window is shown. The image uses
`xvfb-run` to provide a virtual display at runtime — this is invisible to
the user but means headless mode works without a host display server.

## Troubleshooting

**The session picker is empty.** Check that your host mount actually points
at a directory containing `~/.claude/projects`:

```bash
docker run --rm -v "$HOME/.claude:/home/app/.claude:ro" \
  claude-code-trace ls -la /home/app/.claude/projects
```

**Port 8080 is already in use.** Pick a different host port:

```bash
docker run --rm -p 9090:8080 \
  -v "$HOME/.claude:/home/app/.claude:ro" \
  claude-code-trace
```

**`cannot open display` / webkit errors on startup.** The entrypoint uses
`xvfb-run`; if you override the entrypoint make sure you keep it (or
provide your own virtual display). Running the binary directly with
`docker run --entrypoint /usr/local/bin/claude-code-trace ...` will fail.

**File watchers don't see changes.** On some Docker-for-Mac / WSL setups,
`notify`-style filesystem watchers over bind mounts are unreliable. This
affects the "live tailing" feature. A reload usually picks up new content;
for aggressive tailing, prefer running the native desktop app on the host.
