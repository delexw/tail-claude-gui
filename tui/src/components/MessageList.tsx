import { Box, Text } from "ink";
import type { DisplayMessage } from "../api.js";
import { truncate, roleColor, roleIcon, shortModel, modelColor, firstLine } from "../lib/format.js";
import { StatsBar, statsFromMessage } from "./StatsBar.js";

interface MessageListProps {
  messages: DisplayMessage[];
  selectedIndex: number;
  expandedSet: Set<number>;
  ongoing: boolean;
}

/** Left border color for message role — matches web's border-left indicator */
function roleBorderColor(role: string, isError: boolean): string {
  if (isError) return "red";
  switch (role) {
    case "user":
      return "blue";
    case "claude":
      return "gray";
    case "system":
      return "yellow";
    default:
      return "gray";
  }
}

export function MessageList({ messages, selectedIndex, expandedSet, ongoing }: MessageListProps) {
  const cols = process.stdout.columns || 80;
  // Each card takes ~3-5 rows; adjust window accordingly
  const rowBudget = (process.stdout.rows || 24) - 6;
  const windowSize = Math.max(4, Math.floor(rowBudget / 3));

  let start = Math.max(0, selectedIndex - Math.floor(windowSize / 2));
  const end = Math.min(messages.length, start + windowSize);
  if (end - start < windowSize) start = Math.max(0, end - windowSize);
  const visible = messages.slice(start, end);
  const contentWidth = Math.max(cols - 30, 40);

  if (messages.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No messages loaded</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((msg, i) => {
        const idx = start + i;
        const isSelected = idx === selectedIndex;
        const isExpanded = expandedSet.has(idx);
        const isLast = idx === messages.length - 1;
        const stats = statsFromMessage(msg);
        const model = msg.model ? shortModel(msg.model) : "";

        if (msg.role === "compact") {
          return (
            <Box key={idx} paddingX={1} justifyContent="center">
              <Text dimColor>────── {msg.content} ──────</Text>
            </Box>
          );
        }

        const contentPreview = isExpanded
          ? msg.content
          : truncate(firstLine(msg.content), contentWidth);
        const borderClr = isSelected ? "blue" : roleBorderColor(msg.role, msg.is_error);

        return (
          <Box
            key={idx}
            flexDirection="column"
            borderStyle="single"
            borderColor={borderClr}
            borderLeft
            borderRight={false}
            borderTop={false}
            borderBottom={false}
            paddingLeft={1}
            marginBottom={0}
          >
            {/* Header: selection indicator + role icon + name + model + badges */}
            <Box gap={1}>
              <Text bold inverse={isSelected} color={isSelected ? "blue" : roleColor(msg.role)}>
                {isSelected ? "▸ " : "  "}
                {roleIcon(msg.role)}{" "}
                {msg.role === "claude" ? "Claude" : msg.role === "user" ? "User" : "System"}
              </Text>
              {model ? (
                <Text color={modelColor(msg.model)} dimColor={!isSelected}>
                  {model}
                </Text>
              ) : null}
              {msg.subagent_label ? (
                <Text color="cyan" dimColor>
                  [{msg.subagent_label}]
                </Text>
              ) : null}
              {isLast && ongoing ? (
                <Text color="green" bold>
                  ● active
                </Text>
              ) : null}
              {isSelected ? (
                <Text dimColor>
                  [{idx + 1}/{messages.length}]
                </Text>
              ) : null}
            </Box>

            {/* Content */}
            <Box>
              <Text dimColor={!isSelected} wrap={isExpanded ? "wrap" : "truncate"}>
                {contentPreview}
              </Text>
            </Box>

            {/* Stats bar */}
            <StatsBar stats={stats} />

            {/* Expanded items */}
            {isExpanded && msg.items.length > 0 && (
              <Box flexDirection="column" paddingLeft={2} marginTop={0}>
                {msg.items.map((item) => (
                  <Box
                    key={`${item.item_type}-${item.tool_name || ""}-${item.text.slice(0, 20)}`}
                    borderStyle="single"
                    borderColor="gray"
                    borderLeft
                    borderRight={false}
                    borderTop={false}
                    borderBottom={false}
                    paddingLeft={1}
                  >
                    {item.item_type === "ToolCall" ? (
                      <Text color={item.tool_error ? "red" : "blue"}>
                        ⚙ {item.tool_name}
                        {item.tool_summary
                          ? ` — ${truncate(item.tool_summary, contentWidth - 20)}`
                          : ""}
                      </Text>
                    ) : item.item_type === "Thinking" ? (
                      <Text color="gray">💭 {truncate(item.text, contentWidth - 10)}</Text>
                    ) : item.item_type === "Output" ? (
                      <Text>✎ {truncate(item.text, contentWidth - 10)}</Text>
                    ) : item.item_type === "Subagent" ? (
                      <Text color="cyan">
                        🤖 {item.subagent_type || "Agent"}
                        {item.subagent_desc
                          ? ` — ${truncate(item.subagent_desc, contentWidth - 20)}`
                          : ""}
                        {item.subagent_ongoing ? " ●" : ""}
                      </Text>
                    ) : item.item_type === "TeammateMessage" ? (
                      <Text color="blue">
                        👥 {item.team_member_name || "Teammate"}:{" "}
                        {truncate(item.text, contentWidth - 20)}
                      </Text>
                    ) : item.item_type === "HookEvent" ? (
                      <Text color="yellow">
                        ⚡ {item.hook_event}: {item.hook_name}
                      </Text>
                    ) : (
                      <Text color="gray">
                        {item.item_type}: {truncate(item.text, contentWidth - 20)}
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
