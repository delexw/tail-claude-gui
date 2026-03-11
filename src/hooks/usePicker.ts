import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SessionInfo } from "../types";

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

export function usePicker() {
  const [state, setState] = useState<PickerState>({
    sessions: [],
    loading: false,
    searchQuery: "",
  });

  const unlistenRef = useRef<UnlistenFn | null>(null);

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
  useEffect(() => {
    let cancelled = false;

    const setupListener = async () => {
      const unlisten = await listen<{ sessions: SessionInfo[] }>(
        "picker-refresh",
        (event) => {
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            sessions: clearStaleSessions(event.payload.sessions),
          }));
        }
      );

      if (!cancelled) {
        unlistenRef.current = unlisten;
      } else {
        unlisten();
      }
    };

    setupListener();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);

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
  const filteredSessions = state.searchQuery
    ? state.sessions.filter(
        (s) =>
          s.first_message
            .toLowerCase()
            .includes(state.searchQuery.toLowerCase()) ||
          s.session_id
            .toLowerCase()
            .includes(state.searchQuery.toLowerCase()) ||
          s.model.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : state.sessions;

  return {
    sessions: filteredSessions,
    allSessions: state.sessions,
    loading: state.loading,
    searchQuery: state.searchQuery,
    setSearchQuery,
    discoverSessions,
  };
}
