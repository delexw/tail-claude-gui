#!/bin/sh
# Wrap the binary in Xvfb so Tauri v2's webkit2gtk runtime has a display to
# attach to, even though no window is ever shown in headless mode.
set -e

: "${DISPLAY:=:99}"
export DISPLAY

exec xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" "$@"
