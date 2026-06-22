import { describe, it, expect } from "bun:test";
import { PostFrontmatterSchema } from "./schema";

describe("PostFrontmatterSchema — visibility", () => {
  it("defaults visibility to public when not provided", () => {
    const r = PostFrontmatterSchema.safeParse({
      title: "T", date: "2026-01-01", tags: [], categories: []
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe("public");
  });

  it("accepts private", () => {
    const r = PostFrontmatterSchema.safeParse({
      title: "T", date: "2026-01-01", tags: [], categories: [], visibility: "private"
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe("private");
  });

  it("accepts password with a password value", () => {
    const r = PostFrontmatterSchema.safeParse({
      title: "T", date: "2026-01-01", tags: [], categories: [],
      visibility: "password", password: "secret"
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.visibility).toBe("password");
      expect(r.data.password).toBe("secret");
    }
  });

  it("rejects unknown visibility values", () => {
    const r = PostFrontmatterSchema.safeParse({
      title: "T", date: "2026-01-01", tags: [], categories: [], visibility: "hidden"
    });
    expect(r.success).toBe(false);
  });
});
