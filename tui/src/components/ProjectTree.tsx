import { useMemo } from "react";
import { Box, Text } from "ink";
import type { SessionInfo } from "../api.js";
import { colors } from "../lib/theme.js";
import { OngoingDots } from "./OngoingDots.js";

interface ProjectTreeProps {
  sessions: SessionInfo[];
  selectedProject: string | null;
  highlightedIndex: number;
  isFocused: boolean;
}

/** Extract the project directory key from a session path. */
function projectKey(path: string): string {
  const match = path.match(/[/\\]\.claude[/\\]projects[/\\]([^/\\]+)/);
  return match ? match[1] : "unknown";
}

/** Decode a project key to a display name. */
function projectDisplayName(key: string): string {
  const path = key.replace(/^-/, "/").replaceAll("-", "/");
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

export interface ProjectEntry {
  key: string | null; // null = "All"
  name: string;
  count: number;
  ongoingCount: number;
}

export function useProjectEntries(sessions: SessionInfo[]): ProjectEntry[] {
  return useMemo(() => {
    const map = new Map<string, { count: number; ongoing: number }>();
    for (const s of sessions) {
      const key = projectKey(s.path);
      const entry = map.get(key) ?? { count: 0, ongoing: 0 };
      entry.count++;
      if (s.is_ongoing) entry.ongoing++;
      map.set(key, entry);
    }

    const entries: ProjectEntry[] = [
      {
        key: null,
        name: "All",
        count: sessions.length,
        ongoingCount: sessions.filter((s) => s.is_ongoing).length,
      },
    ];
    for (const [key, val] of map) {
      entries.push({
        key,
        name: projectDisplayName(key),
        count: val.count,
        ongoingCount: val.ongoing,
      });
    }
    return entries;
  }, [sessions]);
}

export function ProjectTree({
  sessions,
  selectedProject,
  highlightedIndex,
  isFocused,
}: ProjectTreeProps) {
  const entries = useProjectEntries(sessions);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? colors.accent : colors.border}
      width={24}
    >
      {/* Header */}
      <Box paddingX={1}>
        <Text bold dimColor>
          PROJECTS
        </Text>
      </Box>

      {/* Project list */}
      {entries.map((entry, idx) => {
        const isSelected =
          entry.key === selectedProject || (entry.key === null && selectedProject === null);
        const isHighlighted = isFocused && idx === highlightedIndex;

        return (
          <Box key={entry.key ?? "all"} paddingX={1}>
            <Text
              inverse={isHighlighted}
              bold={isSelected}
              color={isSelected ? colors.accent : undefined}
            >
              {isSelected ? "▸" : " "} {entry.name}
            </Text>
            <Text dimColor> {entry.count}</Text>
            {entry.ongoingCount > 0 ? <OngoingDots count={1} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
