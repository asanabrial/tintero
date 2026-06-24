import { describe, it, expect } from "bun:test";
import { filterAndPaginateTerms } from "../../../src/lib/admin/paginate-terms";

interface MinimalTerm {
  label: string;
  slug: string;
}

function makeTerm(label: string, slug: string): MinimalTerm {
  return { label, slug };
}

const rust = makeTerm("Rust", "rust");
const typescript = makeTerm("TypeScript", "typescript");
const javascript = makeTerm("JavaScript", "javascript");
const webDev = makeTerm("Web Development", "web-development");
const csharp = makeTerm("C#", "csharp");

const allTerms: MinimalTerm[] = [rust, typescript, javascript, webDev, csharp];

describe("filterAndPaginateTerms", () => {
  // --- query filtering ---

  it("empty query returns all terms", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "", page: 1, pageSize: 20 });
    expect(result.items).toEqual(allTerms);
    expect(result.total).toBe(5);
  });

  it("whitespace-only query returns all terms", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "   ", page: 1, pageSize: 20 });
    expect(result.items).toEqual(allTerms);
    expect(result.total).toBe(5);
  });

  it("matches on label (case-insensitive)", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "rust", page: 1, pageSize: 20 });
    expect(result.items).toEqual([rust]);
  });

  it("matches on label with uppercase query", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "TYPESCRIPT", page: 1, pageSize: 20 });
    expect(result.items).toEqual([typescript]);
  });

  it("matches on slug (case-insensitive)", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "web-dev", page: 1, pageSize: 20 });
    expect(result.items).toEqual([webDev]);
  });

  it("query matching slug substring", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "script", page: 1, pageSize: 20 });
    // matches TypeScript (label) and JavaScript (label) and typescript/javascript (slugs) — all 2
    expect(result.items).toEqual([typescript, javascript]);
  });

  it("query matches label substring case-insensitively", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "SCRIPT", page: 1, pageSize: 20 });
    expect(result.items).toEqual([typescript, javascript]);
  });

  it("no match returns empty items and total=0", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "zzznomatch", page: 1, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  // --- pagination ---

  it("page 1 returns first slice", () => {
    const terms = [rust, typescript, javascript, webDev, csharp];
    const result = filterAndPaginateTerms(terms, { query: "", page: 1, pageSize: 2 });
    expect(result.items).toEqual([rust, typescript]);
    expect(result.page).toBe(1);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });

  it("page 2 returns second slice", () => {
    const terms = [rust, typescript, javascript, webDev, csharp];
    const result = filterAndPaginateTerms(terms, { query: "", page: 2, pageSize: 2 });
    expect(result.items).toEqual([javascript, webDev]);
    expect(result.page).toBe(2);
  });

  it("last page may have fewer items than pageSize", () => {
    const terms = [rust, typescript, javascript, webDev, csharp];
    const result = filterAndPaginateTerms(terms, { query: "", page: 3, pageSize: 2 });
    expect(result.items).toEqual([csharp]);
    expect(result.page).toBe(3);
  });

  // --- totalPages math ---

  it("totalPages is ceil(total / pageSize)", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "", page: 1, pageSize: 3 });
    expect(result.totalPages).toBe(2); // ceil(5/3)
  });

  it("totalPages is at least 1 even when empty", () => {
    const result = filterAndPaginateTerms([], { query: "", page: 1, pageSize: 20 });
    expect(result.totalPages).toBe(1);
    expect(result.total).toBe(0);
  });

  it("totalPages=1 when total exactly fits pageSize", () => {
    const result = filterAndPaginateTerms([rust, typescript], { query: "", page: 1, pageSize: 2 });
    expect(result.totalPages).toBe(1);
  });

  // --- out-of-range page clamping ---

  it("page below 1 is clamped to 1", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "", page: 0, pageSize: 2 });
    expect(result.page).toBe(1);
    expect(result.items).toEqual([rust, typescript]);
  });

  it("page above totalPages is clamped to totalPages", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "", page: 999, pageSize: 2 });
    expect(result.page).toBe(3); // totalPages = ceil(5/2) = 3
    expect(result.items).toEqual([csharp]);
  });

  it("NaN page is clamped to 1", () => {
    const result = filterAndPaginateTerms(allTerms, { query: "", page: NaN, pageSize: 2 });
    expect(result.page).toBe(1);
  });
});
