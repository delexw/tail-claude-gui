import { Box, Text } from "ink";
import type { DisplayMessage, DisplayItem } from "../api.js";
import { formatDuration, truncate, roleColor, roleIcon, formatJson } from "../lib/format.js";
import { colors, getItemColor } from "../lib/theme.js";
import { getItemIcon, getItemName, getItemSummary } from "../lib/items.js";
import { StatsBar, statsFromMessage } from "./StatsBar.js";
import { BrailleSpinner, OngoingDot } from "./OngoingDots.js";

interface DetailViewProps {
  message: DisplayMessage;
  selectedItem: number;
  expandedItems: Set<number>;
  ongoing: boolean;
  depth?: number;
}

function itemBorderColor(item: DisplayItem, isSelected: boolean): string {
  if (isSelected) return colors.accent;
  return getItemColor(item.item_type, !!item.tool_error);
}

export function DetailView({
  message,
  selectedItem,
  expandedItems,
  ongoing,
  depth = 0,
}: DetailViewProps) {
  const cols = process.stdout.columns || 80;
  const stats = statsFromMessage(message);

  // Each item is ~2 lines (header + optional summary). Account for message header (~4 lines).
  const rows = process.stdout.rows || 24;
  const windowSize = Math.max(3, Math.floor((rows - 6) / 2));

  const items = message.items;
  let start = Math.max(0, selectedItem - Math.floor(windowSize / 2));
  const end = Math.min(items.length, start + windowSize);
  if (end - start < windowSize) start = Math.max(0, end - windowSize);
  const visible = items.slice(start, end);

  // Fixed-width name column so summaries align
  const maxNameLen = Math.max(4, ...visible.map((it) => getItemName(it).length));

  return (
    <Box flexDirection="column">
      {/* Message header card */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={colors.border}
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        paddingX={1}
      >
        <Box gap={1}>
          {depth > 0 ? <Text dimColor>{"▸".repeat(depth)} </Text> : null}
          <Text bold color={roleColor(message.role)}>
            {roleIcon(message.role)}{" "}
            {message.role === "claude" ? "Claude" : message.role === "user" ? "User" : "System"}
          </Text>
          {message.subagent_label ? (
            <Text color={colors.itemAgent}>[{message.subagent_label}]</Text>
          ) : null}
          <StatsBar stats={stats} />
          {ongoing ? <BrailleSpinner /> : null}
        </Box>
        {items.length > 0 ? (
          <Text dimColor wrap="truncate">
            {truncate(message.content, cols - 4)}
          </Text>
        ) : null}
      </Box>

      {/* Full content when no items (e.g. user messages) */}
      {items.length === 0 ? (
        <Box paddingX={1} flexDirection="column">
          <Text wrap="wrap">{message.content}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {visible.map((item, i) => {
            const idx = start + i;
            const isSelected = idx === selectedItem;
            const isExpanded = expandedItems.has(idx);
            const clr = itemBorderColor(item, isSelected);

            return (
              <Box key={idx} flexDirection="row">
                {/* Left accent border */}
                <Text color={clr}>│</Text>
                <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
                  {/* Item header */}
                  <Box gap={1}>
                    <Text bold={isSelected} inverse={isSelected} color={clr}>
                      {isExpanded ? "▼" : "▶"} {getItemIcon(item)}{" "}
                      {getItemName(item).padEnd(maxNameLen)}
                    </Text>
                    {getItemSummary(item) ? (
                      <Text dimColor>— {truncate(getItemSummary(item), cols - 35)}</Text>
                    ) : null}
                    {item.duration_ms > 0 ? (
                      <Text dimColor>{formatDuration(item.duration_ms)}</Text>
                    ) : null}
                    {item.subagent_ongoing ? <OngoingDot /> : null}
                    {item.agent_id ? <Text dimColor>[{item.agent_id.slice(0, 8)}]</Text> : null}
                  </Box>

                  {/* Expanded body */}
                  {isExpanded && <DetailItemBody item={item} cols={cols} />}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function DetailItemBody({ item, cols }: { item: DisplayItem; cols: number }) {
  const maxWidth = cols - 8;

  switch (item.item_type) {
    case "Thinking":
      return (
        <Box paddingX={1} flexDirection="column">
          <Text color={colors.itemThinking} wrap="wrap">
            {item.text || "Thinking content is not recorded in session logs."}
          </Text>
        </Box>
      );
    case "Output":
      return (
        <Box paddingX={1} flexDirection="column">
          <Text wrap="wrap">{item.text}</Text>
        </Box>
      );
    case "ToolCall":
      return (
        <Box paddingX={1} flexDirection="column">
          {item.tool_input && (
            <Box flexDirection="column">
              <Text bold dimColor>
                INPUT
              </Text>
              <Text dimColor wrap="wrap">
                {truncate(formatJson(item.tool_input), maxWidth * 5)}
              </Text>
            </Box>
          )}
          {item.tool_result && (
            <Box flexDirection="column">
              <Text bold dimColor>
                RESULT
              </Text>
              <Text color={item.tool_error ? colors.error : undefined} wrap="wrap">
                {truncate(item.tool_result, maxWidth * 5)}
              </Text>
            </Box>
          )}
        </Box>
      );
    case "Subagent":
      return (
        <Box paddingX={1} flexDirection="column">
          {item.agent_id && (
            <Box gap={1}>
              <Text bold dimColor>
                ID
              </Text>
              <Text dimColor>{item.agent_id}</Text>
            </Box>
          )}
          {item.subagent_desc && (
            <Box gap={1}>
              <Text bold dimColor>
                DESC
              </Text>
              <Text>{item.subagent_desc}</Text>
            </Box>
          )}
          {item.subagent_prompt && (
            <Box flexDirection="column">
              <Text bold dimColor>
                PROMPT
              </Text>
              <Text wrap="wrap">{truncate(item.subagent_prompt, maxWidth * 3)}</Text>
            </Box>
          )}
          {item.text && (
            <Box flexDirection="column">
              <Text bold dimColor>
                CONTENT
              </Text>
              <Text wrap="wrap">{truncate(item.text, maxWidth * 3)}</Text>
            </Box>
          )}
        </Box>
      );
    case "TeammateMessage":
      return (
        <Box paddingX={1}>
          <Text wrap="wrap">{item.text}</Text>
        </Box>
      );
    case "HookEvent":
      return (
        <Box paddingX={1} flexDirection="column">
          <Box gap={1}>
            <Text bold dimColor>
              HOOK
            </Text>
            <Text>
              {item.hook_event}: {item.hook_name}
            </Text>
          </Box>
          {item.hook_command && (
            <Box gap={1}>
              <Text bold dimColor>
                CMD
              </Text>
              <Text dimColor>{item.hook_command}</Text>
            </Box>
          )}
        </Box>
      );
    default:
      return (
        <Box paddingX={1}>
          <Text wrap="wrap">{item.text}</Text>
        </Box>
      );
  }
}
