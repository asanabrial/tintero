import { describe, it, expect } from "bun:test";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown strips <!--more--> marker", () => {
  it("does not emit the literal marker in output", async () => {
    const md = "Before the fold.\n\n<!--more-->\n\nAfter the fold.";
    const { html } = await renderMarkdown(md);
    expect(html).not.toContain("<!--more-->");
    expect(html).not.toContain("<!-- more -->");
    expect(html).toContain("Before the fold");
    expect(html).toContain("After the fold");
  });

  it("strips <!-- more --> (with spaces inside)", async () => {
    const md = "Intro.\n\n<!-- more -->\n\nRest.";
    const { html } = await renderMarkdown(md);
    expect(html).not.toMatch(/<!--\s*more\s*-->/i);
    expect(html).toContain("Intro");
    expect(html).toContain("Rest");
  });

  it("strips <!-- MORE --> (uppercase)", async () => {
    const md = "Lead.\n\n<!-- MORE -->\n\nTrail.";
    const { html } = await renderMarkdown(md);
    expect(html).not.toMatch(/<!--\s*more\s*-->/i);
  });

  it("leaves content unaffected when no marker is present", async () => {
    const md = "Just a plain paragraph.";
    const { html } = await renderMarkdown(md);
    expect(html).toContain("Just a plain paragraph");
  });
});
