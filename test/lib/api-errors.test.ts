import { describe, expect, test } from "bun:test";
import {
  jsonOk,
  jsonError,
  writeErrorResponse,
} from "../../src/lib/api/errors";
import type { WriteError } from "../../src/lib/content";

// ============================================================
// jsonOk
// ============================================================

describe("jsonOk", () => {
  test("returns 200 by default with JSON body", async () => {
    const res = jsonOk({ hello: "world" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ hello: "world" });
  });

  test("returns custom status when provided", async () => {
    const res = jsonOk({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ created: true });
  });

  test("sets Content-Type to application/json", () => {
    const res = jsonOk({});
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("serializes arrays correctly", async () => {
    const res = jsonOk([1, 2, 3]);
    const body = await res.json();
    expect(body).toEqual([1, 2, 3]);
  });
});

// ============================================================
// jsonError
// ============================================================

describe("jsonError", () => {
  test("returns correct status and error body", async () => {
    const res = jsonError(401, "Unauthorized");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  test("sets Content-Type to application/json", () => {
    const res = jsonError(400, "Bad request");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("includes extra fields in body when provided", async () => {
    const res = jsonError(400, "Invalid input", { field: "title", code: "required" });
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.field).toBe("title");
    expect(body.code).toBe("required");
  });

  test("500 does not leak internal details beyond message", async () => {
    const res = jsonError(500, "Internal error");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal error");
    // No stack trace or extra fields
    expect(Object.keys(body)).toEqual(["error"]);
  });
});

// ============================================================
// writeErrorResponse — all 5 WriteError variants
// ============================================================

describe("writeErrorResponse", () => {
  test("invalid_frontmatter → 400 with issues", async () => {
    const err: WriteError = { kind: "invalid_frontmatter", issues: "title: Required" };
    const res = writeErrorResponse(err);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.issues).toBe("title: Required");
  });

  test("invalid_slug → 400 with slug", async () => {
    const err: WriteError = { kind: "invalid_slug", slug: "../evil" };
    const res = writeErrorResponse(err);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.slug).toBe("../evil");
  });

  test("slug_collision → 409 with slug", async () => {
    const err: WriteError = { kind: "slug_collision", slug: "existing-post" };
    const res = writeErrorResponse(err);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.slug).toBe("existing-post");
  });

  test("post_not_found → 404 with slug", async () => {
    const err: WriteError = { kind: "post_not_found", slug: "ghost-post" };
    const res = writeErrorResponse(err);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.slug).toBe("ghost-post");
  });

  test("page_not_found → 404 with slug", async () => {
    const err: WriteError = { kind: "page_not_found", slug: "ghost-page" };
    const res = writeErrorResponse(err);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.slug).toBe("ghost-page");
  });

  test("all variants have Content-Type application/json", () => {
    const variants: WriteError[] = [
      { kind: "invalid_frontmatter", issues: "x" },
      { kind: "invalid_slug", slug: "x" },
      { kind: "slug_collision", slug: "x" },
      { kind: "post_not_found", slug: "x" },
      { kind: "page_not_found", slug: "x" },
    ];
    for (const err of variants) {
      const res = writeErrorResponse(err);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });
});
