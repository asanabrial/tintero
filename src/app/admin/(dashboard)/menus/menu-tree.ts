// menu-tree.ts
// Pure, immutable functions for manipulating a NavItem tree.
// No React, no Next.js, no FS imports.

import type { NavItem } from "@/lib/content/schema";

export type NavTree = NavItem[];
export type NavLeafItem = { label: string; href: string };

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ────────────────────────────────────────────────────────────
// moveItem
// ────────────────────────────────────────────────────────────

/**
 * Move a top-level item from `fromIndex` to `toIndex` (remove-then-insert).
 * Both indices are clamped to [0, tree.length-1].
 */
export function moveItem(
  tree: NavTree,
  fromIndex: number,
  toIndex: number
): NavTree {
  if (tree.length === 0) return [...tree];
  const last = tree.length - 1;
  const from = clamp(fromIndex, 0, last);
  const to = clamp(toIndex, 0, last);
  if (from === to) return [...tree];
  const copy = [...tree];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// ────────────────────────────────────────────────────────────
// moveItemUp / moveItemDown
// ────────────────────────────────────────────────────────────

/**
 * Move item at `index` one step up (swap with index-1).
 * No-op if index === 0.
 */
export function moveItemUp(tree: NavTree, index: number): NavTree {
  if (index <= 0) return [...tree];
  return moveItem(tree, index, index - 1);
}

/**
 * Move item at `index` one step down (swap with index+1).
 * No-op if item is already last.
 */
export function moveItemDown(tree: NavTree, index: number): NavTree {
  if (index >= tree.length - 1) return [...tree];
  return moveItem(tree, index, index + 1);
}

// ────────────────────────────────────────────────────────────
// nestItem
// ────────────────────────────────────────────────────────────

/**
 * Nest item at `index` under the previous top-level item as a child.
 * Rules:
 * - can only nest if index > 0
 * - item at `index` must NOT have children (can't nest a parent)
 * - if prev item already has children, append as sibling child
 * Returns unchanged tree (same reference) if rules violated.
 */
export function nestItem(tree: NavTree, index: number): NavTree {
  if (index <= 0) return tree;
  const item = tree[index];
  if (item.children && item.children.length > 0) return tree;

  const prevItem = tree[index - 1];
  const { children: _removed, ...leafItem } = item; // strip children (always undefined here, but makes types happy)
  void _removed;
  const newPrev: NavItem = {
    ...prevItem,
    children: [...(prevItem.children ?? []), { label: leafItem.label, href: leafItem.href }],
  };
  return [
    ...tree.slice(0, index - 1),
    newPrev,
    ...tree.slice(index + 1),
  ];
}

// ────────────────────────────────────────────────────────────
// outdentItem
// ────────────────────────────────────────────────────────────

/**
 * Promote (outdent) a child back to top level.
 * Inserts the promoted item at parentIndex+1 in the top-level array.
 * Returns unchanged tree (same reference) if childIndex is out of bounds
 * or parent has no children.
 */
export function outdentItem(
  tree: NavTree,
  parentIndex: number,
  childIndex: number
): NavTree {
  const parent = tree[parentIndex];
  if (!parent?.children || parent.children.length === 0) return tree;
  if (childIndex < 0 || childIndex >= parent.children.length) return tree;

  const promoted = parent.children[childIndex];
  const newChildren = parent.children.filter((_, i) => i !== childIndex);
  const newParent: NavItem = {
    ...parent,
    children: newChildren.length > 0 ? newChildren : undefined,
  };

  return [
    ...tree.slice(0, parentIndex),
    newParent,
    { label: promoted.label, href: promoted.href },
    ...tree.slice(parentIndex + 1),
  ];
}

// ────────────────────────────────────────────────────────────
// addItems
// ────────────────────────────────────────────────────────────

/**
 * Prepend multiple items to the top of the tree (they become top-level items).
 * "Top" means they appear before existing items.
 */
export function addItems(tree: NavTree, items: NavLeafItem[]): NavTree {
  // Append new items to the END of the menu (WordPress "Add to Menu" behaviour).
  return [...tree, ...items.map((i) => ({ label: i.label, href: i.href }))];
}

// ────────────────────────────────────────────────────────────
// removeTopItem
// ────────────────────────────────────────────────────────────

/**
 * Remove a top-level item by index.
 * No-op (returns new array copy) for out-of-bounds index.
 */
export function removeTopItem(tree: NavTree, index: number): NavTree {
  if (index < 0 || index >= tree.length) return [...tree];
  return tree.filter((_, i) => i !== index);
}

// ────────────────────────────────────────────────────────────
// removeChildItem
// ────────────────────────────────────────────────────────────

/**
 * Remove a child item by parentIndex + childIndex.
 * If children array becomes empty, set children to undefined.
 */
export function removeChildItem(
  tree: NavTree,
  parentIndex: number,
  childIndex: number
): NavTree {
  return tree.map((item, i) => {
    if (i !== parentIndex) return item;
    const newChildren = (item.children ?? []).filter((_, j) => j !== childIndex);
    return {
      ...item,
      children: newChildren.length > 0 ? newChildren : undefined,
    };
  });
}

// ────────────────────────────────────────────────────────────
// updateItemLabel / updateChildLabel
// ────────────────────────────────────────────────────────────

/**
 * Update the label of a top-level item.
 */
export function updateItemLabel(
  tree: NavTree,
  index: number,
  label: string
): NavTree {
  return tree.map((item, i) => (i === index ? { ...item, label } : item));
}

/**
 * Update the label of a child item.
 */
export function updateChildLabel(
  tree: NavTree,
  parentIndex: number,
  childIndex: number,
  label: string
): NavTree {
  return tree.map((item, i) => {
    if (i !== parentIndex) return item;
    return {
      ...item,
      children: (item.children ?? []).map((child, j) =>
        j === childIndex ? { ...child, label } : child
      ),
    };
  });
}
