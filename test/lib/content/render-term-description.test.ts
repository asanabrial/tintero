import { describe, it, expect } from "bun:test";
import { renderTermDescription } from "../../../src/lib/content/render-term-description";

describe("renderTermDescription", () => {
  it("returns null for undefined", async () => {
    expect(await renderTermDescription(undefined)).toBeNull();
  });

  it("returns null for null", async () => {
    expect(await renderTermDescription(null)).toBeNull();
  });

  it("returns null for empty string", async () => {
    expect(await renderTermDescription("")).toBeNull();
  });

  it("returns null for whitespace-only string", async () => {
    expect(await renderTermDescription("   ")).toBeNull();
  });

  it("renders **bold** to HTML containing <strong>", async () => {
    const html = await renderTermDescription("**bold**");
    expect(html).toContain("<strong>");
  });

  it("renders a markdown link to an <a element", async () => {
    const html = await renderTermDescription("[x](https://e.com)");
    expect(html).toContain("<a");
  });
});
