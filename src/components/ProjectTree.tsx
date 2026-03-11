import { useMemo } from "react";
import type { SessionInfo } from "../types";
import { shortPath } from "../lib/format";

interface ProjectTreeProps {
  sessions: SessionInfo[];
  selectedProject: string | null;
  onSelectProject: (project: string | null) => void;
}

/** Extract the encoded project directory key from a session path. */
function projectKey(path: string): string {
  const match = path.match(/\/\.claude\/projects\/([^/]+)/);
  return match ? match[1] : "unknown";
}

interface ProjectNode {
  name: string;
  key: string;
  sessionCount: number;
  hasOngoing: boolean;
}

export function ProjectTree({ sessions, selectedProject, onSelectProject }: ProjectTreeProps) {
  const projects = useMemo(() => {
    const map = new Map<string, { name: string; count: number; ongoing: boolean }>();

    for (const s of sessions) {
      const key = projectKey(s.path);
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (s.is_ongoing) existing.ongoing = true;
      } else {
        map.set(key, {
          name: shortPath(s.cwd) || key,
          count: 1,
          ongoing: s.is_ongoing,
        });
      }
    }

    const nodes: ProjectNode[] = [];
    for (const [key, val] of map) {
      nodes.push({
        name: val.name,
        key,
        sessionCount: val.count,
        hasOngoing: val.ongoing,
      });
    }

    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }, [sessions]);

  return (
    <div className="project-tree">
      <div className="project-tree__header">Projects</div>
      <div className="project-tree__list">
        <div
          className={`project-tree__item${selectedProject === null ? " project-tree__item--selected" : ""}`}
          onClick={() => onSelectProject(null)}
        >
          <span className="project-tree__name">All Projects</span>
          <span className="project-tree__count">{sessions.length}</span>
        </div>
        {projects.map((p) => (
          <div
            key={p.key}
            className={`project-tree__item${selectedProject === p.key ? " project-tree__item--selected" : ""}`}
            onClick={() => onSelectProject(p.key)}
          >
            <span className="project-tree__name" title={p.key}>
              {p.name}
            </span>
            <span className="project-tree__meta">
              {p.hasOngoing && <span className="project-tree__ongoing-dot" />}
              <span className="project-tree__count">{p.sessionCount}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
