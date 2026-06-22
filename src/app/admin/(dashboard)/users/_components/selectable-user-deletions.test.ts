import { describe, it, expect } from "bun:test";
import { selectableUserDeletions } from "./selectable-user-deletions";
import type { DeletionCandidate } from "./selectable-user-deletions";

describe("selectableUserDeletions", () => {
  // 1. empty candidates → []
  it("returns [] for empty candidates", () => {
    expect(
      selectableUserDeletions([], { selfId: "self1", totalAdmins: 2 })
    ).toEqual([]);
  });

  // 2. non-admins only (no self) → all returned
  it("returns all non-admin ids when none is self", () => {
    const candidates: DeletionCandidate[] = [
      { id: "u1", role: "editor" },
      { id: "u2", role: "author" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 1 })
    ).toEqual(["u1", "u2"]);
  });

  // 3. self excluded even if non-admin
  it("excludes self even when self is a non-admin", () => {
    const candidates: DeletionCandidate[] = [
      { id: "self1", role: "editor" },
      { id: "u2", role: "author" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 1 })
    ).toEqual(["u2"]);
  });

  // 4. self-admin excluded, other admin deletable (totalAdmins=2, both selected, self=one)
  it("excludes self-admin, allows other admin when totalAdmins=2", () => {
    const candidates: DeletionCandidate[] = [
      { id: "self1", role: "admin" },
      { id: "admin2", role: "admin" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 2 })
    ).toEqual(["admin2"]);
  });

  // 5. last admin preserved: totalAdmins=1, candidates=[thatAdmin] (not self) → []
  it("preserves the last admin (totalAdmins=1) even when not self", () => {
    const candidates: DeletionCandidate[] = [
      { id: "admin1", role: "admin" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 1 })
    ).toEqual([]);
  });

  // 6. two admins both selected, selfId=third party → exactly first admin returned (budget=1)
  it("allows only one admin deletion when totalAdmins=2 and self is third party", () => {
    const candidates: DeletionCandidate[] = [
      { id: "adminA", role: "admin" },
      { id: "adminB", role: "admin" },
    ];
    const result = selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 2 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("adminA"); // first-seen wins
  });

  // 7. mixed: totalAdmins=3, self=adminA, candidates=[adminA,adminB,adminC,editor1]
  //    → [adminB,adminC,editor1] (budget=2, self skipped)
  it("complex mix: self skipped, budget=2 from totalAdmins=3, non-admins pass freely", () => {
    const candidates: DeletionCandidate[] = [
      { id: "adminA", role: "admin" },
      { id: "adminB", role: "admin" },
      { id: "adminC", role: "admin" },
      { id: "editor1", role: "editor" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "adminA", totalAdmins: 3 })
    ).toEqual(["adminB", "adminC", "editor1"]);
  });

  // 8. non-admins alongside last admin: totalAdmins=1, candidates=[admin1,editor1,editor2] (self=other)
  //    → [editor1,editor2]
  it("deletes non-admins but not the last admin when mixed with totalAdmins=1", () => {
    const candidates: DeletionCandidate[] = [
      { id: "admin1", role: "admin" },
      { id: "editor1", role: "editor" },
      { id: "editor2", role: "editor" },
    ];
    expect(
      selectableUserDeletions(candidates, { selfId: "self1", totalAdmins: 1 })
    ).toEqual(["editor1", "editor2"]);
  });
});
