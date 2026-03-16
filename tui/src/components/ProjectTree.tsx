import { useMemo } from "react";
import { Box, Text } from "ink";
import type { SessionInfo } from "../api.js";
import { colors } from "../lib/theme.js";
import { OngoingDot } from "./OngoingDots.js";
import { buildFlatItems } from "../../../shared/projectTree.js";
import type { FlatItem } from "../../../shared/projectTree.js";

interface ProjectTreeProps {
  sessions: SessionInfo[];
  selectedProject: string | null;
  highlightedIndex: number;
  isFocused: boolean;
}

export type { FlatItem };

export function useProjectEntries(sessions: SessionInfo[]): FlatItem[] {
  return useMemo(() => buildFlatItems(sessions), [sessions]);
}

export function ProjectTree({
  sessions,
  selectedProject,
  highlightedIndex,
  isFocused,
}: ProjectTreeProps) {
  const entries = useProjectEntries(sessions);
  // Dynamic width: min 24, adapts to longest entry
  const sidebarWidth = Math.min(
    40,
    Math.max(24, ...entries.map((e) => e.name.length + e.depth * 2 + String(e.count).length + 6)),
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? colors.accent : colors.border}
      width={sidebarWidth}
    >
      {/* Header */}
      <Box paddingX={1}>
        <Text bold dimColor>
          Projects
        </Text>
      </Box>

      {/* Tree items */}
      {entries.map((item, idx) => {
        const isSelected =
          !item.isGroup &&
          (item.key === selectedProject || (item.key === null && selectedProject === null));
        const isHighlighted = isFocused && idx === highlightedIndex;
        const indent = "  ".repeat(item.depth);
        const branch = item.depth > 0 ? "└ " : "";
        const icon = isSelected && !item.isGroup ? "▸" : " ";
        const label = item.isGroup ? `⑃ ${item.name}` : item.name;

        return (
          <Box key={item.key ?? "__all__"} paddingX={1}>
            <Text
              inverse={isHighlighted}
              bold={isSelected}
              color={isSelected ? colors.accent : item.isGroup ? colors.textDim : undefined}
              dimColor={item.isGroup}
              wrap="truncate"
            >
              {icon}
              {indent}
              {branch}
              {label} <Text dimColor>{item.count}</Text>
              {item.ongoing ? " " : ""}
            </Text>
            {item.ongoing ? <OngoingDot /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
