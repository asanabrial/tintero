import { describe, it, expect } from "bun:test";
import {
  moveItem,
  moveItemUp,
  moveItemDown,
  nestItem,
  outdentItem,
  addItems,
  removeTopItem,
  removeChildItem,
  updateItemLabel,
  updateChildLabel,
} from "./menu-tree";
import type { NavItem } from "@/lib/content/schema";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function leaf(label: string, href = `/${label}`): NavItem {
  return { label, href };
}

function parent(label: string, children: NavItem["children"]): NavItem {
  return { label, href: `/${label}`, children };
}

// ────────────────────────────────────────────────────────────
// moveItem
// ────────────────────────────────────────────────────────────

describe("moveItem", () => {
  it("moves an item from index 0 to index 2", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, 0, 2);
    expect(result.map((i) => i.label)).toEqual(["b", "c", "a"]);
  });

  it("moves an item from index 2 to index 0", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, 2, 0);
    expect(result.map((i) => i.label)).toEqual(["c", "a", "b"]);
  });

  it("identity: from === to returns same order", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, 1, 1);
    expect(result.map((i) => i.label)).toEqual(["a", "b", "c"]);
  });

  it("clamps fromIndex below 0 to 0", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, -5, 2);
    expect(result.map((i) => i.label)).toEqual(["b", "c", "a"]);
  });

  it("clamps toIndex above length-1 to last", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, 0, 99);
    expect(result.map((i) => i.label)).toEqual(["b", "c", "a"]);
  });

  it("clamps fromIndex above length-1 to last", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItem(tree, 99, 0);
    expect(result.map((i) => i.label)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    moveItem(tree, 0, 2);
    expect(tree.map((i) => i.label)).toEqual(["a", "b", "c"]);
  });
});

// ────────────────────────────────────────────────────────────
// moveItemUp
// ────────────────────────────────────────────────────────────

describe("moveItemUp", () => {
  it("swaps item with the one above it", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItemUp(tree, 1);
    expect(result.map((i) => i.label)).toEqual(["b", "a", "c"]);
  });

  it("moving index 0 up is a no-op", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItemUp(tree, 0);
    expect(result.map((i) => i.label)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    moveItemUp(tree, 1);
    expect(tree.map((i) => i.label)).toEqual(["a", "b"]);
  });
});

// ────────────────────────────────────────────────────────────
// moveItemDown
// ────────────────────────────────────────────────────────────

describe("moveItemDown", () => {
  it("swaps item with the one below it", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItemDown(tree, 1);
    expect(result.map((i) => i.label)).toEqual(["a", "c", "b"]);
  });

  it("moving last item down is a no-op", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = moveItemDown(tree, 2);
    expect(result.map((i) => i.label)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    moveItemDown(tree, 0);
    expect(tree.map((i) => i.label)).toEqual(["a", "b"]);
  });
});

// ────────────────────────────────────────────────────────────
// nestItem
// ────────────────────────────────────────────────────────────

describe("nestItem", () => {
  it("nests a leaf item under the previous top-level item", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    const result = nestItem(tree, 1);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("a");
    expect(result[0].children).toEqual([{ label: "b", href: "/b" }]);
  });

  it("appends to existing children of the previous item", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }]),
      leaf("b"),
    ];
    const result = nestItem(tree, 1);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children![1]).toEqual({ label: "b", href: "/b" });
  });

  it("is a no-op when index === 0", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    const result = nestItem(tree, 0);
    expect(result.map((i) => i.label)).toEqual(["a", "b"]);
    expect(result).toBe(tree); // same reference — unchanged
  });

  it("is a no-op when item at index has children", () => {
    const tree: NavItem[] = [
      leaf("a"),
      parent("b", [{ label: "c", href: "/c" }]),
    ];
    const result = nestItem(tree, 1);
    expect(result.map((i) => i.label)).toEqual(["a", "b"]);
    expect(result).toBe(tree); // same reference — unchanged
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    nestItem(tree, 1);
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// outdentItem
// ────────────────────────────────────────────────────────────

describe("outdentItem", () => {
  it("promotes a child to top level at parentIndex+1", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }, { label: "y", href: "/y" }]),
      leaf("b"),
    ];
    const result = outdentItem(tree, 0, 0);
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("a");
    expect(result[0].children).toEqual([{ label: "y", href: "/y" }]);
    expect(result[1].label).toBe("x");
    expect(result[2].label).toBe("b");
  });

  it("removes children array from parent when last child is outdented", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }]),
    ];
    const result = outdentItem(tree, 0, 0);
    expect(result).toHaveLength(2);
    expect(result[0].children).toBeUndefined();
  });

  it("is a no-op for an out-of-bounds childIndex", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }]),
    ];
    const result = outdentItem(tree, 0, 5);
    expect(result).toBe(tree);
  });

  it("is a no-op when parent has no children", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    const result = outdentItem(tree, 0, 0);
    expect(result).toBe(tree);
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }]),
    ];
    outdentItem(tree, 0, 0);
    expect(tree[0].children).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// addItems
// ────────────────────────────────────────────────────────────

describe("addItems", () => {
  it("adds items to an empty tree", () => {
    const result = addItems([], [{ label: "Home", href: "/" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "Home", href: "/" });
  });

  it("appends multiple items to the END of the tree (WordPress behaviour)", () => {
    const tree: NavItem[] = [leaf("existing")];
    const result = addItems(tree, [
      { label: "a", href: "/a" },
      { label: "b", href: "/b" },
    ]);
    expect(result[0].label).toBe("existing");
    expect(result[1].label).toBe("a");
    expect(result[2].label).toBe("b");
  });

  it("adding empty list returns a new array with same content", () => {
    const tree: NavItem[] = [leaf("a")];
    const result = addItems(tree, []);
    expect(result).toHaveLength(1);
  });

  it("does not mutate input tree", () => {
    const tree: NavItem[] = [leaf("a")];
    addItems(tree, [{ label: "b", href: "/b" }]);
    expect(tree).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// removeTopItem
// ────────────────────────────────────────────────────────────

describe("removeTopItem", () => {
  it("removes the item at the given index", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b"), leaf("c")];
    const result = removeTopItem(tree, 1);
    expect(result.map((i) => i.label)).toEqual(["a", "c"]);
  });

  it("is a no-op for an out-of-bounds index", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    const result = removeTopItem(tree, 5);
    expect(result.map((i) => i.label)).toEqual(["a", "b"]);
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    removeTopItem(tree, 0);
    expect(tree).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────
// removeChildItem
// ────────────────────────────────────────────────────────────

describe("removeChildItem", () => {
  it("removes a child at the given indices", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }, { label: "y", href: "/y" }]),
    ];
    const result = removeChildItem(tree, 0, 0);
    expect(result[0].children).toEqual([{ label: "y", href: "/y" }]);
  });

  it("sets children to undefined when last child is removed", () => {
    const tree: NavItem[] = [parent("a", [{ label: "x", href: "/x" }])];
    const result = removeChildItem(tree, 0, 0);
    expect(result[0].children).toBeUndefined();
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [parent("a", [{ label: "x", href: "/x" }])];
    removeChildItem(tree, 0, 0);
    expect(tree[0].children).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// updateItemLabel
// ────────────────────────────────────────────────────────────

describe("updateItemLabel", () => {
  it("updates the label of the item at the given index", () => {
    const tree: NavItem[] = [leaf("a"), leaf("b")];
    const result = updateItemLabel(tree, 0, "Home");
    expect(result[0].label).toBe("Home");
    expect(result[1].label).toBe("b");
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [leaf("a")];
    updateItemLabel(tree, 0, "New");
    expect(tree[0].label).toBe("a");
  });

  it("returns new array reference", () => {
    const tree: NavItem[] = [leaf("a")];
    const result = updateItemLabel(tree, 0, "New");
    expect(result).not.toBe(tree);
  });
});

// ────────────────────────────────────────────────────────────
// updateChildLabel
// ────────────────────────────────────────────────────────────

describe("updateChildLabel", () => {
  it("updates the label of a child item", () => {
    const tree: NavItem[] = [
      parent("a", [{ label: "x", href: "/x" }, { label: "y", href: "/y" }]),
    ];
    const result = updateChildLabel(tree, 0, 1, "Z");
    expect(result[0].children![0].label).toBe("x");
    expect(result[0].children![1].label).toBe("Z");
  });

  it("does not mutate input", () => {
    const tree: NavItem[] = [parent("a", [{ label: "x", href: "/x" }])];
    updateChildLabel(tree, 0, 0, "Y");
    expect(tree[0].children![0].label).toBe("x");
  });
});

// ────────────────────────────────────────────────────────────
// Immutability cross-check
// ────────────────────────────────────────────────────────────

describe("Immutability — all functions return new arrays", () => {
  const tree: NavItem[] = [
    leaf("a"),
    parent("b", [{ label: "c", href: "/c" }]),
    leaf("d"),
  ];

  it("moveItem returns a new array", () => {
    expect(moveItem(tree, 0, 2)).not.toBe(tree);
  });

  it("moveItemUp returns a new array", () => {
    expect(moveItemUp(tree, 1)).not.toBe(tree);
  });

  it("moveItemDown returns a new array", () => {
    expect(moveItemDown(tree, 1)).not.toBe(tree);
  });

  it("nestItem (valid nest) returns a new array", () => {
    const t: NavItem[] = [leaf("a"), leaf("b")];
    expect(nestItem(t, 1)).not.toBe(t);
  });

  it("outdentItem (valid outdent) returns a new array", () => {
    const t: NavItem[] = [parent("a", [{ label: "x", href: "/x" }])];
    expect(outdentItem(t, 0, 0)).not.toBe(t);
  });

  it("addItems returns a new array", () => {
    expect(addItems(tree, [{ label: "z", href: "/z" }])).not.toBe(tree);
  });

  it("removeTopItem returns a new array", () => {
    expect(removeTopItem(tree, 0)).not.toBe(tree);
  });

  it("removeChildItem returns a new array", () => {
    expect(removeChildItem(tree, 1, 0)).not.toBe(tree);
  });

  it("updateItemLabel returns a new array", () => {
    expect(updateItemLabel(tree, 0, "X")).not.toBe(tree);
  });

  it("updateChildLabel returns a new array", () => {
    expect(updateChildLabel(tree, 1, 0, "X")).not.toBe(tree);
  });
});
