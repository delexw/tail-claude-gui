import { Box, Text } from "ink";
import { colors } from "../lib/theme.js";

type ViewState = "picker" | "list" | "detail" | "team" | "debug";

interface KeyHint {
  key: string;
  label: string;
}

const pickerKeys: KeyHint[] = [
  { key: "h", label: "sidebar" },
  { key: "j/k", label: "nav" },
  { key: "Enter", label: "open" },
  { key: "/", label: "search" },
  { key: "q", label: "quit" },
];

const listKeys: KeyHint[] = [
  { key: "h", label: "sidebar" },
  { key: "j/k", label: "nav" },
  { key: "G/g", label: "jump" },
  { key: "Tab", label: "toggle" },
  { key: "Enter", label: "detail" },
  { key: "e/c", label: "expand" },
  { key: "d", label: "debug" },
  { key: "q", label: "sessions" },
];

const listKeysWithTeams: KeyHint[] = [
  ...listKeys.slice(0, 5),
  { key: "t", label: "tasks" },
  ...listKeys.slice(5),
];

const detailKeys: KeyHint[] = [
  { key: "j/k", label: "items" },
  { key: "Enter/Tab", label: "toggle" },
  { key: "u/d", label: "scroll" },
  { key: "e/c", label: "expand" },
  { key: "q/Esc", label: "back" },
];

const debugKeys: KeyHint[] = [{ key: "q/Esc", label: "back" }];

const teamKeys: KeyHint[] = [{ key: "q/Esc", label: "back" }];

function getKeys(view: ViewState, hasTeams: boolean): KeyHint[] {
  switch (view) {
    case "picker":
      return pickerKeys;
    case "list":
      return hasTeams ? listKeysWithTeams : listKeys;
    case "detail":
      return detailKeys;
    case "debug":
      return debugKeys;
    case "team":
      return teamKeys;
  }
}

interface KeybindBarProps {
  view: ViewState;
  hasTeams: boolean;
  position?: string;
}

export function KeybindBar({ view, hasTeams, position }: KeybindBarProps) {
  const keys = getKeys(view, hasTeams);

  return (
    <Box paddingX={1} borderStyle="round" borderColor={colors.border}>
      {/* "tail" prefix — matches Go TUI keybind bar */}
      <Text color={colors.textDim}>tail</Text>
      {keys.map((hint) => (
        <Box key={hint.key} gap={0}>
          <Text color={colors.textMuted}> · </Text>
          <Text bold color={colors.accent}>
            {hint.key}
          </Text>
          <Text dimColor> {hint.label}</Text>
        </Box>
      ))}
      {/* Spacer pushes position to the right */}
      <Box flexGrow={1} />
      {position ? <Text dimColor>{position}</Text> : null}
    </Box>
  );
}
