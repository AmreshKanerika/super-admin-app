export interface HierarchyItem {
  appId: string;
  parentAppId: string | null;
}

export interface TreeRow<T extends HierarchyItem> {
  item: T;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  childCount: number;
  descendantIds: string[];
  matched: boolean;
  rails: boolean[];
  isLastChild: boolean;
}

export interface TreeOptions {
  expandedIds: ReadonlySet<string>;
  matchedIds?: ReadonlySet<string> | null;
}

function indexByParent<T extends HierarchyItem>(items: readonly T[]): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  const knownIds = new Set(items.map((item) => item.appId));
  for (const item of items) {
    const parentKey = item.parentAppId && knownIds.has(item.parentAppId) ? item.parentAppId : '';
    const siblings = byParent.get(parentKey);
    if (siblings) {
      siblings.push(item);
    } else {
      byParent.set(parentKey, [item]);
    }
  }
  return byParent;
}

export function collectDescendantIds<T extends HierarchyItem>(items: readonly T[], appId: string): string[] {
  const byParent = indexByParent(items);
  const collected: string[] = [];
  const walk = (parentId: string) => {
    for (const child of byParent.get(parentId) ?? []) {
      collected.push(child.appId);
      walk(child.appId);
    }
  };
  walk(appId);
  return collected;
}

export function collectAncestorIds<T extends HierarchyItem>(items: readonly T[], appId: string): string[] {
  const byId = new Map(items.map((item) => [item.appId, item]));
  const ancestors: string[] = [];
  let current = byId.get(appId)?.parentAppId ?? null;
  while (current && byId.has(current) && !ancestors.includes(current)) {
    ancestors.push(current);
    current = byId.get(current)?.parentAppId ?? null;
  }
  return ancestors;
}

export function allParentIds<T extends HierarchyItem>(items: readonly T[]): string[] {
  const byParent = indexByParent(items);
  return items.filter((item) => (byParent.get(item.appId) ?? []).length > 0).map((item) => item.appId);
}

function subtreeHasMatch<T extends HierarchyItem>(
  byParent: Map<string, T[]>,
  appId: string,
  matchedIds: ReadonlySet<string>
): boolean {
  for (const child of byParent.get(appId) ?? []) {
    if (matchedIds.has(child.appId) || subtreeHasMatch(byParent, child.appId, matchedIds)) {
      return true;
    }
  }
  return false;
}

export function buildTreeRows<T extends HierarchyItem>(
  items: readonly T[],
  options: TreeOptions,
  compare?: (first: T, second: T) => number
): TreeRow<T>[] {
  const byParent = indexByParent(items);
  if (compare) {
    for (const siblings of byParent.values()) {
      siblings.sort(compare);
    }
  }

  const matchedIds = options.matchedIds;
  const rows: TreeRow<T>[] = [];

  const isVisible = (item: T): boolean => {
    if (!matchedIds) {
      return true;
    }
    return matchedIds.has(item.appId) || subtreeHasMatch(byParent, item.appId, matchedIds);
  };

  const walk = (parentKey: string, depth: number, rails: boolean[]) => {
    const siblings = (byParent.get(parentKey) ?? []).filter(isVisible);
    siblings.forEach((item, index) => {
      const children = (byParent.get(item.appId) ?? []).filter(isVisible);
      const hasChildren = children.length > 0;
      const forcedOpen = !!matchedIds && subtreeHasMatch(byParent, item.appId, matchedIds);
      const expanded = hasChildren && (forcedOpen || options.expandedIds.has(item.appId));
      const isLastChild = index === siblings.length - 1;

      rows.push({
        item,
        depth,
        hasChildren,
        expanded,
        childCount: children.length,
        descendantIds: collectDescendantIds(items, item.appId),
        matched: !matchedIds || matchedIds.has(item.appId),
        rails,
        isLastChild
      });

      if (expanded) {
        walk(item.appId, depth + 1, [...rails, !isLastChild]);
      }
    });
  };

  walk('', 0, []);
  return rows;
}

export interface FlatTreeMeta {
  hasChildren: boolean;
  expanded: boolean;
  isLastChild: boolean;
  rails: boolean[];
  descendantCount: number;
  matched: boolean;
}

export interface FlatTreeOptions<T> {
  depthOf: (row: T) => number;
  idOf: (row: T) => string;
  collapsedIds: ReadonlySet<string>;
  matches?: ((row: T) => boolean) | null;
}

// Decorates an already depth-first-ordered flat list with the structural metadata a tree view
// needs, without changing the caller's own row model or ordering.
export function decorateDfsRows<T>(rows: readonly T[], options: FlatTreeOptions<T>): (T & FlatTreeMeta)[] {
  const { depthOf, idOf, collapsedIds, matches } = options;
  const count = rows.length;
  const depths = rows.map(depthOf);

  const hasChildren: boolean[] = new Array(count).fill(false);
  const descendantCount: number[] = new Array(count).fill(0);
  const isLastChild: boolean[] = new Array(count).fill(true);
  const selfMatched: boolean[] = rows.map((row) => (matches ? matches(row) : true));
  const subtreeMatched: boolean[] = [...selfMatched];

  for (let index = count - 1; index >= 0; index--) {
    let descendants = 0;
    for (let next = index + 1; next < count && depths[next] > depths[index]; next++) {
      descendants++;
      if (subtreeMatched[next]) {
        subtreeMatched[index] = true;
      }
    }
    descendantCount[index] = descendants;
    hasChildren[index] = index + 1 < count && depths[index + 1] === depths[index] + 1;

    for (let next = index + 1; next < count; next++) {
      if (depths[next] < depths[index]) break;
      if (depths[next] === depths[index]) {
        isLastChild[index] = false;
        break;
      }
    }
  }

  const decorated: (T & FlatTreeMeta)[] = [];
  const ancestorIndexByDepth: number[] = [];
  let hiddenBelowDepth = Number.POSITIVE_INFINITY;

  for (let index = 0; index < count; index++) {
    const depth = depths[index];
    ancestorIndexByDepth[depth] = index;

    if (depth > hiddenBelowDepth) {
      continue;
    }
    hiddenBelowDepth = Number.POSITIVE_INFINITY;

    if (matches && !subtreeMatched[index]) {
      continue;
    }

    const forcedOpen = !!matches && descendantCount[index] > 0 && subtreeMatched[index];
    const expanded = hasChildren[index] && (forcedOpen || !collapsedIds.has(idOf(rows[index])));
    if (hasChildren[index] && !expanded) {
      hiddenBelowDepth = depth;
    }

    const rails: boolean[] = [];
    for (let level = 0; level < depth; level++) {
      const ancestorIndex = ancestorIndexByDepth[level];
      rails.push(ancestorIndex === undefined ? false : !isLastChild[ancestorIndex]);
    }

    decorated.push({
      ...rows[index],
      hasChildren: hasChildren[index],
      expanded,
      isLastChild: isLastChild[index],
      rails,
      descendantCount: descendantCount[index],
      matched: selfMatched[index]
    });
  }

  return decorated;
}

export interface TreeGroup<T> {
  root: T;
  children: T[];
}

// Buckets a parent-first flat list into one group per top-level row, so a template can render
// each family as its own card instead of one long indented list. The flat list stays the source
// of truth for search, filtering and expand/collapse — this only changes how it is presented.
export function groupByRoot<T>(rows: readonly T[], depthOf: (row: T) => number): TreeGroup<T>[] {
  const groups: TreeGroup<T>[] = [];
  for (const row of rows) {
    const depth = depthOf(row);
    const current = groups[groups.length - 1];
    // A filtered list (e.g. enabled-only) can start below depth 0 — a disabled parent whose child
    // is enabled leaves that child with no depth-0 root. Anything at or above the current group is
    // therefore a root in its own right, otherwise those rows would be silently dropped.
    if (!current || depth <= depthOf(current.root)) {
      groups.push({ root: row, children: [] });
    } else {
      current.children.push(row);
    }
  }
  return groups;
}
