import { describe, expect, test } from "bun:test";
import { sanitizeWidgetHtml } from "../../../src/lib/widgets/custom-html-sanitize";

describe("sanitizeWidgetHtml — XSS vectors", () => {
  test("strips script tags and their content", () => {
    const result = sanitizeWidgetHtml('<script>alert(1)</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  test("strips on* event attributes (onerror)", () => {
    const result = sanitizeWidgetHtml('<img src="x.png" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("alert(1)");
  });

  test("strips javascript: href", () => {
    const result = sanitizeWidgetHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  test("strips iframe tags", () => {
    const result = sanitizeWidgetHtml('<iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("evil.com");
  });

  test("strips style tags and their content", () => {
    const result = sanitizeWidgetHtml('<style>body { background: red; }</style>');
    expect(result).not.toContain("<style");
    expect(result).not.toContain("background: red");
  });

  test("strips onclick attribute but preserves p tag and text content", () => {
    const result = sanitizeWidgetHtml('<p onclick="x()">text</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
    expect(result).toContain("<p");
    expect(result).toContain("</p>");
  });

  test("preserves safe p and strong tags", () => {
    const result = sanitizeWidgetHtml("<p>Hello <strong>world</strong></p>");
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>world</strong>");
    expect(result).toContain("</p>");
  });

  test("preserves safe relative href", () => {
    const result = sanitizeWidgetHtml('<a href="/safe">link</a>');
    expect(result).toContain('href="/safe"');
    expect(result).toContain("link");
  });

  test("preserves safe https href", () => {
    const result = sanitizeWidgetHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  test("handles script tag with attributes", () => {
    const result = sanitizeWidgetHtml('<script type="text/javascript">evil()</script>');
    expect(result).not.toContain("<script");
    expect(result).not.toContain("evil()");
  });

  test("handles self-closing iframe", () => {
    const result = sanitizeWidgetHtml('<iframe src="bad" />');
    expect(result).not.toContain("<iframe");
  });

  test("strips onload attribute", () => {
    const result = sanitizeWidgetHtml('<body onload="hack()">content</body>');
    expect(result).not.toContain("onload");
    expect(result).not.toContain("hack()");
  });
});
