import type { DisplayItem } from "../api.js";

/** Returns a compact summary of a JSON string: `{key1, key2, …}` or `[N items]`. */
function jsonShapeSummary(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return `[${parsed.length} items]`;
    if (typeof parsed === "object" && parsed !== null) {
      const keys = Object.keys(parsed);
      const shown = keys.slice(0, 4).join(", ");
      return `{${shown}${keys.length > 4 ? ", …" : ""}}`;
    }
  } catch {
    // not JSON
  }
  return null;
}
import {
  IconThinking,
  IconOutput,
  IconTool,
  IconSubagent,
  IconTeammate,
  IconHook,
  IconDot,
} from "./icons.js";

/** Nerd Font icon for a DisplayItem type (matches Go TUI). */
export function getItemIcon(item: DisplayItem): string {
  switch (item.item_type) {
    case "Thinking":
      return IconThinking;
    case "Output":
      return IconOutput;
    case "ToolCall":
      return IconTool;
    case "Subagent":
      return IconSubagent;
    case "TeammateMessage":
      return IconTeammate;
    case "HookEvent":
      return IconHook;
    default:
      return IconDot;
  }
}

/** Display name for a DisplayItem. */
export function getItemName(item: DisplayItem): string {
  switch (item.item_type) {
    case "Thinking":
      return "Thinking";
    case "Output":
      return "Output";
    case "ToolCall":
      return item.tool_name || "Tool";
    case "Subagent":
      return item.subagent_type || "Subagent";
    case "TeammateMessage":
      return item.team_member_name || "Teammate";
    case "HookEvent":
      return item.hook_event || "Hook";
    default:
      return item.item_type;
  }
}

/** Short summary for a DisplayItem. */
export function getItemSummary(item: DisplayItem): string {
  switch (item.item_type) {
    case "ToolCall":
      return item.tool_summary || "";
    case "Subagent":
      return item.subagent_desc || "";
    case "TeammateMessage":
      return item.text || "";
    case "Thinking":
      return item.text || "Content not recorded";
    case "Output":
      if (!item.text) return "";
      return jsonShapeSummary(item.text) ?? item.text;
    case "HookEvent":
      return item.hook_name
        ? `${item.hook_name}${item.hook_command ? ": " + item.hook_command : ""}`
        : item.hook_command || "";
    default:
      return "";
  }
}
