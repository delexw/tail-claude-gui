import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { api, type SessionInfo } from "./api.js";
import { formatTokens, formatCost, timeAgo, truncate } from "../../shared/format.js";

interface SessionPickerProps {
  onSelect: (session: SessionInfo) => void;
}

export function SessionPicker({ onSelect }: SessionPickerProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const dirs = await api.getProjectDirs();
        if (dirs.length === 0) {
          setError("No project directories found. Run the desktop app first to configure.");
          setLoading(false);
          return;
        }
        const list = await api.discoverSessions(dirs);
        setSessions(list);
      } catch (e) {
        setError(`Cannot connect to backend. Is the app running?\n${e}`);
      }
      setLoading(false);
    })();
  }, []);

  useInput((input, key) => {
    if (loading || sessions.length === 0) return;
    if (input === "j" || key.downArrow) {
      setSelected((i) => Math.min(i + 1, sessions.length - 1));
    } else if (input === "k" || key.upArrow) {
      setSelected((i) => Math.max(i - 1, 0));
    } else if (key.return) {
      onSelect(sessions[selected]);
    }
  });

  if (loading) {
    return (
      <Box padding={1}>
        <Spinner label="Discovering sessions..." />
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  // Show a window of sessions around the selection
  const windowSize = process.stdout.rows ? process.stdout.rows - 4 : 20;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selected - half);
  const end = Math.min(sessions.length, start + windowSize);
  if (end - start < windowSize) start = Math.max(0, end - windowSize);
  const visible = sessions.slice(start, end);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Sessions ({sessions.length}) — j/k navigate, Enter open, q quit</Text>
      </Box>
      {visible.map((s, i) => {
        const idx = start + i;
        const isSelected = idx === selected;
        return (
          <Box key={s.path}>
            <Text color={isSelected ? "blue" : undefined} bold={isSelected} inverse={isSelected}>
              {isSelected ? " ▸ " : "   "}
              {s.is_ongoing ? "● " : "  "}
              <Text dimColor={!isSelected}>{truncate(s.first_message || s.session_id, 50)}</Text>
              <Text dimColor> {formatTokens(s.total_tokens)} tok</Text>
              <Text dimColor color="yellow">
                {" "}
                {formatCost(s.cost_usd)}
              </Text>
              <Text dimColor> {timeAgo(s.mod_time)}</Text>
              {s.model ? (
                <Text dimColor color="cyan">
                  {" "}
                  {s.model.split("-")[0]}
                </Text>
              ) : null}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
