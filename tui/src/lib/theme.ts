/**
 * Theme colors for TUI — aligned with tail-claude Bubble Tea theme.
 * Ink supports hex colors in modern terminals.
 *
 * Color values map to ANSI-256 equivalents used in the Go TUI:
 * - Text hierarchy: 252 / 245 / 243 / 240
 * - Accent: 75 (blue), Border: 60 (muted blue)
 * - Status: 76 (green), 208 (orange), 196 (red)
 */

export const colors = {
  // Text hierarchy (ANSI 252 / 245 / 243 / 240)
  textPrimary: "#d0d0d0",
  textSecondary: "#8a8a8a",
  textDim: "#767676",
  textMuted: "#585858",

  // Accents (ANSI 75 / 69 / 196)
  accent: "#5fafff",
  info: "#5f87ff",
  error: "#ff0000",

  // Borders (ANSI 60 — muted blue)
  border: "#5f5f87",

  // Model family (ANSI 204 / 75 / 114)
  modelOpus: "#ff5f87",
  modelSonnet: "#5fafff",
  modelHaiku: "#87d787",

  // Token highlight (ANSI 208)
  tokenHigh: "#ff8700",

  // Ongoing indicator (ANSI 76)
  ongoing: "#5faf00",

  // Context usage (ANSI 114 / 208 / 196)
  contextOk: "#87d787",
  contextWarn: "#ff8700",
  contextCrit: "#ff0000",

  // Permission mode pills (ANSI 196 / 135 / 114)
  pillBypass: "#ff0000",
  pillAcceptEdits: "#af5fff",
  pillPlan: "#87d787",

  // Git branch (ANSI 135)
  gitBranch: "#af5fff",

  // Picker selection background (ANSI 237 — subtle elevation)
  pickerSelectedBg: "#3a3a3a",

  // Roles
  roleUser: "#5fafff",
  roleClaude: "#8a8a8a",
  roleSystem: "#585858",

  // Item types
  itemThinking: "#767676",
  itemOutput: "#d0d0d0",
  itemTool: "#5fafff",
  itemToolError: "#ff0000",
  itemAgent: "#5fafaf",
  itemTeammate: "#5fafff",
  itemHook: "#ffdf00",
} as const;

export const teamColors: Record<string, string> = {
  blue: "#5fafff",
  green: "#87d787",
  red: "#ff5f87",
  yellow: "#ffdf00",
  purple: "#d787ff",
  cyan: "#5fafaf",
  orange: "#ff8700",
  pink: "#ff87af",
};

export function getModelColor(model: string): string {
  if (model.includes("opus")) return colors.modelOpus;
  if (model.includes("sonnet")) return colors.modelSonnet;
  if (model.includes("haiku")) return colors.modelHaiku;
  return colors.textSecondary;
}

export function getTeamColor(name: string): string {
  return teamColors[name.toLowerCase()] ?? colors.accent;
}

export function getContextColor(pct: number): string {
  if (pct < 50) return colors.contextOk;
  if (pct < 80) return colors.contextWarn;
  return colors.contextCrit;
}

export function getRoleBorderColor(role: string, isError: boolean): string {
  if (isError) return colors.error;
  switch (role) {
    case "user":
      return colors.roleUser;
    case "claude":
      return colors.roleClaude;
    case "system":
      return colors.roleSystem;
    default:
      return colors.border;
  }
}

export function getItemColor(itemType: string, hasError: boolean): string {
  switch (itemType) {
    case "Thinking":
      return colors.itemThinking;
    case "Output":
      return colors.itemOutput;
    case "ToolCall":
      return hasError ? colors.itemToolError : colors.itemTool;
    case "Subagent":
      return colors.itemAgent;
    case "TeammateMessage":
      return colors.itemTeammate;
    case "HookEvent":
      return colors.itemHook;
    default:
      return colors.textDim;
  }
}
