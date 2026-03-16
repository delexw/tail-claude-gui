import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { api, type DisplayMessage } from "./api.js";
import { useSSE } from "./useSSE.js";

interface MessageViewProps {
  sessionPath: string;
  onBack: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}

function truncate(s: string, max: number): string {
  // Strip newlines for single-line display
  const line = s.replace(/\n/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

function roleColor(role: string): string {
  switch (role) {
    case "claude":
      return "magenta";
    case "user":
      return "green";
    case "system":
      return "yellow";
    default:
      return "white";
  }
}

function roleIcon(role: string): string {
  switch (role) {
    case "claude":
      return "🤖";
    case "user":
      return "👤";
    case "system":
      return "⚙️";
    default:
      return "  ";
  }
}

export function MessageView({ sessionPath, onBack }: MessageViewProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [ongoing, setOngoing] = useState(false);
  const [meta, setMeta] = useState({ cwd: "", git_branch: "", permission_mode: "" });
  const [totals, setTotals] = useState({ total_tokens: 0, cost_usd: 0, model: "" });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const result = await api.loadSession(sessionPath);
        setMessages(result.messages);
        setOngoing(result.ongoing);
        setMeta(result.meta);
        setTotals(result.session_totals);
        setSelected(result.messages.length - 1);
        await api.watchSession(sessionPath);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
    return () => {
      api.unwatchSession().catch(() => {});
    };
  }, [sessionPath]);

  // Live updates via SSE
  useSSE<{
    messages: DisplayMessage[];
    ongoing: boolean;
    permission_mode: string;
    session_totals: { total_tokens: number; cost_usd: number; model: string };
  }>(
    "session-update",
    useCallback((payload) => {
      setMessages(payload.messages);
      setOngoing(payload.ongoing);
      setTotals(payload.session_totals);
      if (payload.permission_mode) {
        setMeta((m) => ({ ...m, permission_mode: payload.permission_mode }));
      }
    }, []),
  );

  const toggle = useCallback((idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onBack();
    } else if (input === "j" || key.downArrow) {
      setSelected((i) => Math.min(i + 1, messages.length - 1));
    } else if (input === "k" || key.upArrow) {
      setSelected((i) => Math.max(i - 1, 0));
    } else if (key.tab) {
      toggle(selected);
    } else if (input === "e") {
      // Expand all Claude messages
      const all = new Set<number>();
      messages.forEach((m, i) => {
        if (m.role === "claude") all.add(i);
      });
      setExpanded(all);
    } else if (input === "c") {
      setExpanded(new Set());
    } else if (input === "G") {
      setSelected(messages.length - 1);
    } else if (input === "g") {
      setSelected(0);
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Spinner label="Loading session..." />
      </Box>
    );
  }

  const cols = process.stdout.columns || 80;
  const windowSize = (process.stdout.rows || 24) - 6;

  // Info bar
  const projectName = meta.cwd.split("/").pop() || "";
  const branch = meta.git_branch || "";

  // Window around selection
  let start = Math.max(0, selected - Math.floor(windowSize / 2));
  const end = Math.min(messages.length, start + windowSize);
  if (end - start < windowSize) start = Math.max(0, end - windowSize);
  const visible = messages.slice(start, end);

  return (
    <Box flexDirection="column">
      {/* Info bar */}
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">
          {projectName}
        </Text>
        {branch ? <Text dimColor>{branch}</Text> : null}
        <Text dimColor>{formatTokens(totals.total_tokens)} tok</Text>
        <Text dimColor color="yellow">
          ${totals.cost_usd.toFixed(2)}
        </Text>
        {ongoing ? (
          <Text color="green" bold>
            {" "}
            ● active
          </Text>
        ) : null}
      </Box>

      {/* Messages */}
      <Box flexDirection="column" paddingX={1}>
        {visible.map((msg, i) => {
          const idx = start + i;
          const isSelected = idx === selected;
          const isExpanded = expanded.has(idx);
          const contentWidth = cols - 12;

          return (
            <Box key={idx} flexDirection="column">
              <Box>
                <Text inverse={isSelected} bold={isSelected} color={roleColor(msg.role)}>
                  {isSelected ? "▸" : " "}
                  {roleIcon(msg.role)} {msg.role.padEnd(7)}
                </Text>
                <Text dimColor={!isSelected}> {truncate(msg.content, contentWidth - 30)}</Text>
                {msg.tool_call_count > 0 && (
                  <Text dimColor color="yellow">
                    {" "}
                    ⚙{msg.tool_call_count}
                  </Text>
                )}
                {msg.tokens_raw > 0 && <Text dimColor> {formatTokens(msg.tokens_raw)}</Text>}
                {msg.duration_ms > 0 && <Text dimColor> {formatDuration(msg.duration_ms)}</Text>}
              </Box>

              {/* Expanded: show items */}
              {isExpanded && msg.items.length > 0 && (
                <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
                  {msg.items.map((item) => (
                    <Box key={`${item.item_type}-${item.tool_name || item.text.slice(0, 20)}`}>
                      <Text dimColor>
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
                          <Text>{truncate(item.text, contentWidth - 10)}</Text>
                        ) : (
                          <Text color="gray">
                            {item.item_type}: {truncate(item.text, contentWidth - 20)}
                          </Text>
                        )}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Status bar */}
      <Box paddingX={1} gap={2}>
        <Text dimColor>
          j/k nav Tab expand e/c all G/g jump q back {selected + 1}/{messages.length}
        </Text>
      </Box>
    </Box>
  );
}
