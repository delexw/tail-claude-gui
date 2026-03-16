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

// ---- Tree building (mirrors web's ProjectTree.tsx) ----

function projectKey(path: string): string {
  const match = path.match(/[/\\]\.claude[/\\]projects[/\\]([^/\\]+)/);
  return match ? match[1] : "unknown";
}

function shortPath(cwd: string): string {
  if (!cwd) return "";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function projectDisplayName(key: string): string {
  const path = key.replace(/^-/, "/").replaceAll("-", "/");
  return shortPath(path) || key;
}

interface ProjectNode {
  name: string;
  key: string;
  sessionCount: number;
  hasOngoing: boolean;
}

function buildProjectNodes(sessions: SessionInfo[]): ProjectNode[] {
  const map = new Map<string, ProjectNode>();
  for (const s of sessions) {
    const key = projectKey(s.path);
    const existing = map.get(key);
    if (existing) {
      existing.sessionCount++;
      if (s.is_ongoing) existing.hasOngoing = true;
    } else {
      // Use shortPath(cwd) for name — same as web
      map.set(key, {
        name: shortPath(s.cwd) || projectDisplayName(key),
        key,
        sessionCount: 1,
        hasOngoing: s.is_ongoing,
      });
    }
  }
  return [...map.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

interface TreeNode {
  node: ProjectNode;
  children: TreeNode[];
}

function treeNodeCmp(a: TreeNode, b: TreeNode): number {
  return a.node.name.localeCompare(b.node.name);
}

function buildTree(nodes: ProjectNode[]): TreeNode[] {
  const sorted = [...nodes].toSorted((a, b) => a.key.length - b.key.length);
  const roots: TreeNode[] = [];
  const all: TreeNode[] = [];

  for (const node of sorted) {
    let parent: TreeNode | undefined;
    for (const candidate of all) {
      if (
        node.key.startsWith(candidate.node.key + "-") &&
        (!parent || candidate.node.key.length > parent.node.key.length)
      ) {
        parent = candidate;
      }
    }

    const tn: TreeNode = { node, children: [] };
    all.push(tn);

    if (parent) {
      // Child label relative to parent
      const childLabel =
        node.key.slice(parent.node.key.length).replace(/^-+/, "") || projectDisplayName(node.key);
      // Use cwd-based name if available, otherwise derived label
      tn.node = { ...node, name: node.name || childLabel };
      parent.children.push(tn);
    } else {
      roots.push(tn);
    }
  }

  roots.sort(treeNodeCmp);
  for (const r of all) r.children.sort(treeNodeCmp);
  return roots;
}

type WorktreeKind = "worktrees" | "claude-worktrees";

function detectWorktreeKind(parentKey: string, childKey: string): WorktreeKind | null {
  const rest = childKey.slice(parentKey.length);
  if (rest.startsWith("--claude-worktrees-")) return "claude-worktrees";
  if (rest.startsWith("-worktrees-")) return "worktrees";
  return null;
}

function worktreeLeafName(parentKey: string, childKey: string, kind: WorktreeKind): string {
  const prefixLen =
    kind === "claude-worktrees" ? "--claude-worktrees-".length : "-worktrees-".length;
  return (
    childKey.slice(parentKey.length + prefixLen).replace(/^-+/, "") || projectDisplayName(childKey)
  );
}

interface FlatItem {
  key: string | null;
  name: string;
  count: number;
  ongoing: boolean;
  depth: number;
  isGroup: boolean;
}

function flattenTree(roots: TreeNode[]): FlatItem[] {
  const items: FlatItem[] = [];

  function walk(nodes: TreeNode[], depth: number, parentKey: string | null) {
    for (const tn of nodes) {
      items.push({
        key: tn.node.key,
        name: tn.node.name,
        count: tn.node.sessionCount,
        ongoing: tn.node.hasOngoing,
        depth,
        isGroup: false,
      });

      // Categorise children into worktree groups and regular
      const groups = new Map<WorktreeKind, TreeNode[]>();
      const regular: TreeNode[] = [];
      for (const child of tn.children) {
        const kind =
          parentKey !== null || depth === 0
            ? detectWorktreeKind(tn.node.key, child.node.key)
            : null;
        if (kind) {
          let list = groups.get(kind);
          if (!list) {
            list = [];
            groups.set(kind, list);
          }
          list.push(child);
        } else {
          regular.push(child);
        }
      }

      // Emit worktree group headers + their children
      for (const [kind, children] of groups) {
        const totalCount = children.reduce((s, c) => s + c.node.sessionCount, 0);
        const anyOngoing = children.some((c) => c.node.hasOngoing);
        items.push({
          key: `__group:${kind}:${tn.node.key}`,
          name: kind === "worktrees" ? "⑃ worktrees" : "⑃ claude-worktrees",
          count: totalCount,
          ongoing: anyOngoing,
          depth: depth + 1,
          isGroup: true,
        });
        for (const child of children) {
          items.push({
            key: child.node.key,
            name: worktreeLeafName(tn.node.key, child.node.key, kind),
            count: child.node.sessionCount,
            ongoing: child.node.hasOngoing,
            depth: depth + 2,
            isGroup: false,
          });
          walk(child.children, depth + 3, child.node.key);
        }
      }

      walk(regular, depth + 1, tn.node.key);
    }
  }

  walk(roots, 0, null);
  return items;
}

// ---- Exported hook + component ----

export function useProjectEntries(sessions: SessionInfo[]): FlatItem[] {
  return useMemo(() => {
    const nodes = buildProjectNodes(sessions);
    const tree = buildTree(nodes);
    const flat = flattenTree(tree);
    return [
      {
        key: null,
        name: "All Projects",
        count: sessions.length,
        ongoing: false,
        depth: 0,
        isGroup: false,
      },
      ...flat,
    ];
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
      width={26}
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
        const indent = item.depth > 0 ? "  ".repeat(item.depth) : "";
        const branch = item.depth > 0 ? "└ " : "";

        return (
          <Box key={item.key ?? "__all__"} paddingX={1}>
            <Text
              inverse={isHighlighted}
              bold={isSelected}
              color={isSelected ? colors.accent : item.isGroup ? colors.textDim : undefined}
              dimColor={item.isGroup}
            >
              {isSelected && !item.isGroup ? "▸" : " "}
              {indent}
              {branch}
              {item.name}
            </Text>
            <Text dimColor> {item.count}</Text>
            {item.ongoing ? <OngoingDots count={1} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}
