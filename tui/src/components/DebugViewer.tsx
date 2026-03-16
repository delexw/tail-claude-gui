import { Box, Text } from "ink";
import type { DebugEntry } from "../api.js";
import { truncate } from "../lib/format.js";
import { colors } from "../lib/theme.js";
import { stableWindow } from "../lib/window.js";

interface DebugViewerProps {
  entries: DebugEntry[];
  selectedIndex: number;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
      return colors.error;
    case "warn":
      return colors.tokenHigh;
    case "info":
      return colors.accent;
    case "debug":
      return colors.textDim;
    default:
      return colors.textPrimary;
  }
}

export function DebugViewer({ entries, selectedIndex }: DebugViewerProps) {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const windowSize = Math.max(4, rows - 6);
  const { start, end } = stableWindow("debug", selectedIndex, entries.length, windowSize);
  const visible = entries.slice(start, end);

  if (entries.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No debug entries</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Debug Log ({entries.length})</Text>
      </Box>

      {visible.map((entry, i) => {
        const idx = start + i;
        const isSelected = idx === selectedIndex;
        // Go TUI format: HH:MM:SS.mmm with milliseconds
        const ts = entry.timestamp
          ? entry.timestamp.split("T")[1]?.replace("Z", "").slice(0, 12) || ""
          : "";

        return (
          <Box key={entry.line_num}>
            {/* Cursor — matches Go TUI's chevron/bar pattern */}
            <Text inverse={isSelected} bold={isSelected}>
              {isSelected ? "\u02C3" : " "}
            </Text>
            {/* Timestamp with milliseconds (dim) */}
            <Text dimColor> {ts.padEnd(12)} </Text>
            {/* Level badge — WARN/ERROR/DEBUG (bold, colored) */}
            <Text color={levelColor(entry.level)} bold>
              {entry.level.toUpperCase().padEnd(5)}{" "}
            </Text>
            {/* Category in brackets (dim agent color) */}
            {entry.category ? (
              <Text color={colors.itemAgent} dimColor>
                [{entry.category}]{" "}
              </Text>
            ) : null}
            {/* Message */}
            <Text dimColor={!isSelected}>{truncate(entry.message, cols - 35)}</Text>
            {/* Repeat count (right-aligned, orange) */}
            {entry.count > 1 ? <Text color={colors.tokenHigh}> x{entry.count}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
