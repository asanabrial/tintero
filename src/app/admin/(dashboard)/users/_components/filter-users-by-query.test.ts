import { describe, it, expect } from "bun:test";
import { filterUsersByQuery } from "./filter-users-by-query";
import type { PublicUser } from "@/lib/auth/types";

function makeUser(email: string): PublicUser {
  return { id: "1", email, role: "author", createdAt: new Date(), name: null, bio: null };
}

const alice = makeUser("alice@example.com");
const bob = makeUser("bob@test.org");
const carol = makeUser("carol@Example.com");
const dave = makeUser("DAVE@UPPER.COM");

describe("filterUsersByQuery", () => {
  it("empty q returns all users", () => {
    const users = [alice, bob];
    expect(filterUsersByQuery(users, "")).toEqual(users);
  });

  it("whitespace-only q returns all users", () => {
    const users = [alice, bob];
    expect(filterUsersByQuery(users, "   ")).toEqual(users);
  });

  it("lowercase needle hits lowercase email", () => {
    const users = [alice, bob];
    expect(filterUsersByQuery(users, "alice")).toEqual([alice]);
  });

  it("uppercase query matches lowercase email (case-insensitive both ways)", () => {
    const users = [alice, bob];
    expect(filterUsersByQuery(users, "ALICE")).toEqual([alice]);
  });

  it("lowercase query matches uppercase email (case-insensitive both ways)", () => {
    const users = [dave];
    expect(filterUsersByQuery(users, "dave")).toEqual([dave]);
  });

  it("partial substring match in the middle of an email", () => {
    const users = [alice, carol, bob];
    expect(filterUsersByQuery(users, "example")).toEqual([alice, carol]);
  });

  it("no match returns empty array", () => {
    const users = [alice, bob];
    expect(filterUsersByQuery(users, "zzz")).toEqual([]);
  });
});
