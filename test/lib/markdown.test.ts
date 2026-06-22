import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../../src/lib/content/markdown";

describe("renderMarkdown", () => {
  test("GFM pipe table is rendered as a <table> element", async () => {
    const md = `
| A | B |
|---|---|
| 1 | 2 |
`.trim();
    const { html } = await renderMarkdown(md);
    expect(html).toContain("<table>");
  });

  test("heading ## gets id and child anchor href", async () => {
    const { html } = await renderMarkdown("## Hello World");
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('href="#hello-world"');
  });

  test("typescript fenced code block contains syntax-highlight tokens", async () => {
    const md = "```typescript\nconst x: number = 1;\n```";
    const { html } = await renderMarkdown(md);
    // shiki produces spans with class attributes
    expect(html).toContain("<span");
  });

  test("unknown language fenced block renders as plain code without error", async () => {
    const md = "```unknownlang\nsome code\n```";
    let html = "";
    let threw = false;
    try {
      ({ html } = await renderMarkdown(md));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(html).toContain("<code");
  });

  test("wikilink [[Some Note]] does not produce an <a> tag and does not throw", async () => {
    const md = "Some text with [[Some Note]] inline.";
    const { html } = await renderMarkdown(md);
    // No href pointing to the wikilink target
    expect(html).not.toMatch(/<a[^>]+href="#some-note"/);
    // The text content should be present (rendered as text)
    expect(html).not.toContain('href="Some Note"');
  });

  test("image wikilink ![[image.png]] does not crash", async () => {
    const md = "An image: ![[image.png]] in text.";
    let threw = false;
    try {
      await renderMarkdown(md);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

describe("renderMarkdown wikilink resolution", () => {
  const wikiResolver = (target: string) =>
    target.trim().toLowerCase() === "some note"
      ? { url: "/blog/some-note" }
      : null;

  test("resolved [[Some Note]] renders a wikilink <a> to the target URL", async () => {
    const { html } = await renderMarkdown("See [[Some Note]] here.", { wikiResolver });
    expect(html).toMatch(/<a[^>]+href="\/blog\/some-note"[^>]*>Some Note<\/a>/);
    expect(html).toContain('class="wikilink"');
  });

  test("aliased [[Some Note|the note]] uses the alias as link text", async () => {
    const { html } = await renderMarkdown("See [[Some Note|the note]].", { wikiResolver });
    expect(html).toMatch(/<a[^>]+href="\/blog\/some-note"[^>]*>the note<\/a>/);
  });

  test("unresolved [[Ghost]] renders a broken span, not an <a>", async () => {
    const { html } = await renderMarkdown("A [[Ghost]] link.", { wikiResolver });
    expect(html).toContain("wikilink-broken");
    expect(html).toContain(">Ghost</span>");
    expect(html).not.toMatch(/<a[^>]+>Ghost<\/a>/);
  });

  test("surrounding text is preserved around a resolved wikilink", async () => {
    const { html } = await renderMarkdown("before [[Some Note]] after", { wikiResolver });
    expect(html).toContain("before ");
    expect(html).toContain(" after");
  });

  test("embed ![[Some Note]] stays plain text even with a resolver", async () => {
    const { html } = await renderMarkdown("![[Some Note]]", { wikiResolver });
    expect(html).not.toContain("<a");
    expect(html).toContain("Some Note");
  });
});
