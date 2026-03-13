import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionInfo } from "../types";
import { useTauriEvent } from "./useTauriEvent";

/** Sessions inactive for longer than this are no longer "ongoing". */
const ONGOING_STALENESS_MS = 120_000;

/** Clear is_ongoing for sessions whose mod_time is stale. */
function clearStaleSessions(sessions: SessionInfo[]): SessionInfo[] {
  const now = Date.now();
  return sessions.map((s) => {
    if (!s.is_ongoing) return s;
    const modMs = new Date(s.mod_time).getTime();
    if (isNaN(modMs) || now - modMs > ONGOING_STALENESS_MS) {
      return { ...s, is_ongoing: false };
    }
    return s;
  });
}

interface PickerState {
  sessions: SessionInfo[];
  loading: boolean;
  searchQuery: string;
}

export function usePicker(selectedProject: string | null = null) {
  const [state, setState] = useState<PickerState>({
    sessions: [],
    loading: false,
    searchQuery: "",
  });

  const discoverSessions = useCallback(async (projectDirs: string[]) => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const sessions = await invoke<SessionInfo[]>("discover_sessions", {
        projectDirs,
      });
      setState((prev) => ({ ...prev, sessions: clearStaleSessions(sessions), loading: false }));

      // Start watching for new sessions
      try {
        await invoke<void>("watch_picker", { projectDirs });
      } catch {
        // watcher is optional
      }
    } catch (err) {
      console.error("Failed to discover sessions:", err);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  // Listen for picker-refresh events
  useTauriEvent<{ sessions: SessionInfo[] }>("picker-refresh", (payload) => {
    setState((prev) => ({
      ...prev,
      sessions: clearStaleSessions(payload.sessions),
    }));
  });

  // Periodic staleness check — clear "ACTIVE" even if no file events fire
  useEffect(() => {
    const id = setInterval(() => {
      setState((prev) => {
        const updated = clearStaleSessions(prev.sessions);
        // Only update if something actually changed
        if (updated === prev.sessions || updated.every((s, i) => s === prev.sessions[i])) {
          return prev;
        }
        return { ...prev, sessions: updated };
      });
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      invoke<void>("unwatch_picker").catch(() => {});
    };
  }, []);

  // Filter sessions by search query
  let filteredSessions = state.searchQuery
    ? state.sessions.filter(
        (s) =>
          s.first_message.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          s.session_id.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          s.model.toLowerCase().includes(state.searchQuery.toLowerCase()),
      )
    : state.sessions;

  // Filter by selected project
  if (selectedProject) {
    filteredSessions = filteredSessions.filter((s) =>
      s.path.replace(/\\/g, "/").includes(`/.claude/projects/${selectedProject}/`),
    );
  }

  return {
    sessions: filteredSessions,
    allSessions: state.sessions,
    loading: state.loading,
    searchQuery: state.searchQuery,
    setSearchQuery,
    discoverSessions,
  };
}
