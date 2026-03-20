/** TUI-specific formatting utilities. Shared format functions come from shared/format.ts. */

import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { transformInlineJson } from "../../../shared/format.js";
export {
  formatTokens,
  formatCost,
  formatDuration,
  truncate,
  timeAgo,
  transformInlineJson,
} from "../../../shared/format.js";

import { colors, getModelColor as _getModelColor } from "./theme.js";
import { IconClaude, IconUser, IconSystem } from "./icons.js";

/** Turns "claude-opus-4-6" into "opus4.6". */
export function shortModel(m: string): string {
  const s = m.replace(/^claude-/, "");
  const dashIdx = s.indexOf("-");
  if (dashIdx === -1) return s;
  const family = s.slice(0, dashIdx);
  const rest = s.slice(dashIdx + 1);
  const vParts = rest.split("-");
  let version = vParts[0];
  if (vParts.length >= 2) {
    version = vParts[0] + "." + vParts[1];
  }
  return family + version;
}

/** Returns hex color for a model string (matches web theme). */
export function modelColor(m: string): string {
  return _getModelColor(m);
}

/** Returns hex color for a message role (matches web theme). */
export function roleColor(role: string): string {
  switch (role) {
    case "claude":
      return colors.textSecondary;
    case "user":
      return colors.accent;
    case "system":
      return colors.textMuted;
    default:
      return colors.textPrimary;
  }
}

/** Returns a Nerd Font icon for a message role (matches Go TUI). */
export function roleIcon(role: string): string {
  switch (role) {
    case "claude":
      return IconClaude;
    case "user":
      return IconUser;
    case "system":
      return IconSystem;
    default:
      return " ";
  }
}

/** Returns the first non-empty line of text. */
export function firstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? text : text.slice(0, idx);
}

/** Pretty-prints a JSON string. Returns original on parse failure. */
export function formatJson(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

/**
 * Detects bare JSON objects/arrays in plain text and pretty-prints them
 * in-place (no markdown fences — TUI renders plain text, not markdown).
 */
export function prettyInlineJson(text: string): string {
  return transformInlineJson(text, (prefix, formatted) =>
    prefix ? prefix + "\n" + formatted : formatted,
  );
}

// Initialise marked with the terminal renderer once at module load.
marked.use(
  markedTerminal({
    // Keep reflowed text — do not hard-wrap at 80 chars.
    width: 0,
    // Paragraph spacing: single blank line.
    paragraph: (text: string) => text + "\n",
  }),
);

/**
 * Render markdown text for terminal display.
 * Bare JSON blobs are fenced first so they render as code blocks.
 * Returns a string with ANSI escape codes for bold/italic/colour.
 */
export function renderMarkdown(text: string): string {
  // Fence bare JSON before passing to marked so it renders as a code block.
  const fenced = transformInlineJson(
    text,
    (prefix, formatted) => (prefix ? prefix + "\n" : "") + "```json\n" + formatted + "\n```",
  );
  const result = marked(fenced);
  // marked returns string | Promise<string>; it is synchronous here.
  return (typeof result === "string" ? result : text).trimEnd();
}
