/**
 * Pure formatting utilities shared between Tauri UI and TUI.
 * No React, DOM, or framework dependencies.
 */

/** Formats a token count: 1234 -> "1.2k", 1234567 -> "1.2M" */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

/** Formats USD cost: 1.5 -> "$1.50" */
export function formatCost(usd: number): string {
  return "$" + usd.toFixed(2);
}

/** Formats duration: 1500 -> "1.5s", 90000 -> "1m 30s" */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

/** Truncate string to max length with ellipsis, collapsing newlines. */
export function truncate(s: string, max: number): string {
  const line = s.replace(/\n/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

/** Relative time: "3m ago", "2h ago", "5d ago" */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
