import type React from "react";
import { Box, Text } from "ink";
import type { DisplayMessage } from "../api.js";
import { formatTokens, formatDuration } from "../lib/format.js";
import { colors } from "../lib/theme.js";

export interface Stats {
  tokens: number;
  toolCount: number;
  thinkingCount: number;
  outputCount: number;
  durationMs: number;
  agentCount: number;
  spawnCount: number;
}

export function statsFromMessage(msg: DisplayMessage): Stats {
  const agentCount = msg.items.filter(
    (it) => it.item_type === "Subagent" || it.subagent_messages.length > 0,
  ).length;
  return {
    tokens: msg.tokens_raw,
    toolCount: msg.tool_call_count,
    thinkingCount: msg.thinking_count,
    outputCount: msg.output_count,
    durationMs: msg.duration_ms,
    agentCount,
    spawnCount: msg.teammate_spawns,
  };
}

function hasAny(s: Stats): boolean {
  return (
    s.tokens > 0 ||
    s.toolCount > 0 ||
    s.thinkingCount > 0 ||
    s.outputCount > 0 ||
    s.durationMs > 0 ||
    s.agentCount > 0 ||
    s.spawnCount > 0
  );
}

/** Middle dot separator for stats. */
function Dot() {
  return <Text color={colors.textMuted}> · </Text>;
}

export function StatsBar({ stats }: { stats: Stats }) {
  if (!hasAny(stats)) return null;

  // Build parts array, then join with dots (matches Go TUI stat row)
  const parts: React.ReactNode[] = [];

  if (stats.thinkingCount > 0) {
    parts.push(
      <Text key="think" dimColor color={colors.itemThinking}>
        {"\uF0EB"} {stats.thinkingCount}
      </Text>,
    );
  }
  if (stats.toolCount > 0) {
    parts.push(
      <Text key="tool" dimColor color={colors.itemTool}>
        {"\uF0BE0"} {stats.toolCount}
      </Text>,
    );
  }
  if (stats.outputCount > 0) {
    parts.push(
      <Text key="out" dimColor>
        {"\uF0182"} {stats.outputCount}
      </Text>,
    );
  }
  if (stats.agentCount > 0) {
    parts.push(
      <Text key="agent" dimColor color={colors.itemAgent}>
        {"\uF167A"} {stats.agentCount}
      </Text>,
    );
  }
  if (stats.spawnCount > 0) {
    parts.push(
      <Text key="spawn" dimColor>
        ↗ {stats.spawnCount}
      </Text>,
    );
  }
  if (stats.tokens > 0) {
    parts.push(
      <Text key="tok" dimColor color={stats.tokens > 150000 ? colors.tokenHigh : undefined}>
        {formatTokens(stats.tokens)}
      </Text>,
    );
  }
  if (stats.durationMs > 0) {
    parts.push(
      <Text key="dur" dimColor>
        {formatDuration(stats.durationMs)}
      </Text>,
    );
  }

  return (
    <Box>
      {parts.map((part, i) => (
        <Box key={i}>
          {i > 0 && <Dot />}
          {part}
        </Box>
      ))}
    </Box>
  );
}
