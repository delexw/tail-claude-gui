import { useMemo } from "react";
import type { SessionInfo } from "../types";
import { shortPath, projectKey, projectDisplayName } from "../lib/format";
import { useScrollToSelected } from "../hooks/useScrollToSelected";

interface ProjectTreeProps {
  sessions: SessionInfo[];
  selectedProject: string | null;
  highlightedIndex?: number;
  isFocused?: boolean;
  onSelectProject: (project: string | null) => void;
  onRefresh: () => void;
  onFocus?: () => void;
  refreshing?: boolean;
  style?: React.CSSProperties;
}

interface ProjectNode {
  name: string;
  key: string;
  sessionCount: number;
  hasOngoing: boolean;
}

interface TreeNode {
  node: ProjectNode;
  children: TreeNode[];
}

function buildProjectNodes(sessions: SessionInfo[]): ProjectNode[] {
  const map = new Map<string, { name: string; count: number; ongoing: boolean }>();

  for (const s of sessions) {
    const key = projectKey(s.path);
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (s.is_ongoing) existing.ongoing = true;
    } else {
      map.set(key, {
        name: shortPath(s.cwd) || projectDisplayName(key),
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
}

/**
 * Extract a short label for the child portion of the key.
 * Strips the parent key prefix + separator dash(es).
 */
function childLabel(parentKey: string, childKey: string): string {
  const rest = childKey.slice(parentKey.length).replace(/^-+/, "");
  return rest || projectDisplayName(childKey);
}

/**
 * Group flat nodes into a tree. A node B is a child of A if B.key starts
 * with A.key + "-" and A.key is itself a project in the set.
 */
function buildTree(nodes: ProjectNode[]): TreeNode[] {
  // Sort by key length so parents come before children
  const sorted = nodes.toSorted((a, b) => a.key.length - b.key.length);
  const roots: TreeNode[] = [];
  const treeNodes: TreeNode[] = [];

  for (const node of sorted) {
    let parent: TreeNode | undefined;
    // Find the longest matching parent (B.key starts with A.key + "-")
    for (const candidate of treeNodes) {
      if (
        node.key.startsWith(candidate.node.key + "-") &&
        (!parent || candidate.node.key.length > parent.node.key.length)
      ) {
        parent = candidate;
      }
    }

    const treeNode: TreeNode = { node, children: [] };
    treeNodes.push(treeNode);

    if (parent) {
      treeNode.node = { ...node, name: childLabel(parent.node.key, node.key) };
      parent.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  // Sort roots by display name, children by display name
  roots.sort((a, b) => a.node.name.localeCompare(b.node.name));
  for (const r of treeNodes) {
    r.children.sort((a, b) => a.node.name.localeCompare(b.node.name));
  }

  return roots;
}

type WorktreeKind = "worktrees" | "claude-worktrees";

function detectWorktreeKind(parentKey: string, childKey: string): WorktreeKind | null {
  const rest = childKey.slice(parentKey.length);
  if (rest.startsWith("--claude-worktrees-")) return "claude-worktrees";
  if (rest.startsWith("-worktrees-")) return "worktrees";
  return null;
}

/** Strip the worktree group prefix to get a short leaf name. */
function worktreeLeafName(parentKey: string, childKey: string, kind: WorktreeKind): string {
  const suffixLen =
    kind === "claude-worktrees" ? "--claude-worktrees-".length : "-worktrees-".length;
  const rest = childKey.slice(parentKey.length + suffixLen).replace(/^-+/, "");
  return rest || projectDisplayName(childKey);
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
          name: kind,
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

      // Emit regular children
      walk(regular, depth + 1, tn.node.key);
    }
  }

  walk(roots, 0, null);
  return items;
}

/**
 * Returns the ordered list of selectable keys as displayed in the tree.
 * Index 0 = null ("All Projects"), then project keys and group keys in tree order.
 */
export function useProjectKeys(sessions: SessionInfo[]): (string | null)[] {
  return useMemo(() => {
    const nodes = buildProjectNodes(sessions);
    const tree = buildTree(nodes);
    const flat = flattenTree(tree);
    return [null, ...flat.map((f) => f.key)];
  }, [sessions]);
}

export function ProjectTree({
  sessions,
  selectedProject,
  highlightedIndex = 0,
  isFocused = false,
  onSelectProject,
  onRefresh,
  onFocus,
  refreshing,
  style,
}: ProjectTreeProps) {
  const flatItems = useMemo(() => {
    const nodes = buildProjectNodes(sessions);
    const tree = buildTree(nodes);
    return flattenTree(tree);
  }, [sessions]);

  const scrollRef = useScrollToSelected(highlightedIndex);

  const allItems: FlatItem[] = [
    {
      key: null,
      name: "All Projects",
      count: sessions.length,
      ongoing: false,
      depth: 0,
      isGroup: false,
    },
    ...flatItems,
  ];

  return (
    <div
      className={`project-tree${isFocused ? " project-tree--focused" : ""}`}
      style={style}
      onClick={onFocus}
    >
      <div className="project-tree__header">
        <span>Projects</span>
        <button
          className={`project-tree__refresh${refreshing ? " project-tree__refresh--spinning" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          title="Refresh all projects"
        >
          {"\u21BB"}
        </button>
      </div>
      <div className="project-tree__list">
        {allItems.map((item, idx) => {
          const isSelected = !item.isGroup && selectedProject === item.key;
          const isHighlighted = isFocused && idx === highlightedIndex;
          return (
            <div
              key={item.key ?? "__all__"}
              ref={isHighlighted ? scrollRef : undefined}
              className={`project-tree__item${isSelected ? " project-tree__item--selected" : ""}${isHighlighted ? " project-tree__item--highlighted" : ""}${item.depth > 0 ? " project-tree__item--child" : ""}${item.isGroup ? " project-tree__item--group" : ""}`}
              style={item.depth > 0 ? { paddingLeft: 12 + item.depth * 16 } : undefined}
              onClick={item.isGroup ? undefined : () => onSelectProject(item.key)}
            >
              <span
                className="project-tree__name"
                title={item.isGroup ? undefined : (item.key ?? undefined)}
              >
                {item.depth > 0 && <span className="project-tree__branch">{"\u2514"} </span>}
                {item.name}
              </span>
              <span className="project-tree__meta">
                {item.ongoing && <span className="project-tree__ongoing-dot" />}
                <span className="project-tree__count">{item.count}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
