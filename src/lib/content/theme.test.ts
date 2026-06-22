import { describe, it, expect } from "bun:test";
import {
  buildThemeCssVars,
  validateThemeFields,
  HEX_COLOR_RE,
} from "./theme";

describe("buildThemeCssVars", () => {
  it("returns empty string when called with undefined", () => {
    expect(buildThemeCssVars(undefined)).toBe("");
  });

  it("returns empty string for an empty theme object", () => {
    expect(buildThemeCssVars({})).toBe("");
  });

  it("emits --color-primary for colorPrimary", () => {
    const css = buildThemeCssVars({ colorPrimary: "#3b82f6" });
    expect(css).toContain("--color-primary:#3b82f6");
    expect(css).toMatch(/^:root\{/);
    expect(css).toMatch(/\}$/);
  });

  it("emits all 5 color CSS vars in stable order", () => {
    const css = buildThemeCssVars({
      colorPrimary: "#111111",
      colorAccent: "#222222",
      colorHeaderBg: "#333333",
      colorText: "#444444",
      colorBackground: "#555555",
    });
    expect(css).toContain("--color-primary:#111111");
    expect(css).toContain("--color-accent:#222222");
    expect(css).toContain("--color-header-bg:#333333");
    expect(css).toContain("--color-text:#444444");
    expect(css).toContain("--color-bg:#555555");
    // Verify stable ordering (primary before accent before header-bg etc.)
    const primaryIdx = css.indexOf("--color-primary");
    const accentIdx = css.indexOf("--color-accent");
    const headerBgIdx = css.indexOf("--color-header-bg");
    expect(primaryIdx).toBeLessThan(accentIdx);
    expect(accentIdx).toBeLessThan(headerBgIdx);
  });

  it("skips empty color fields", () => {
    const css = buildThemeCssVars({ colorPrimary: "#ff0000", colorAccent: "" });
    expect(css).toContain("--color-primary:#ff0000");
    expect(css).not.toContain("--color-accent");
  });

  it("emits --font-body and --font-sans for a known fontBody key", () => {
    const css = buildThemeCssVars({ fontBody: "serif" });
    expect(css).toContain("--font-body:");
    expect(css).toContain("--font-sans:");
  });

  it("emits --font-heading for fontHeading but NOT --font-body or --font-sans", () => {
    const css = buildThemeCssVars({ fontHeading: "mono" });
    expect(css).toContain("--font-heading:");
    expect(css).not.toContain("--font-body:");
    expect(css).not.toContain("--font-sans:");
  });

  it("does NOT emit --font-body for an unknown font key", () => {
    // fontBody is typed as string in ThemeConfig — passing an unknown key is valid
    // at the type level, but the runtime guard (isKnownFontKey) should reject it.
    const css = buildThemeCssVars({ fontBody: "comic-sans" });
    expect(css).not.toContain("--font-body");
  });

  it("emits --header-image url() for headerImage", () => {
    const css = buildThemeCssVars({ headerImage: "/uploads/banner.jpg" });
    expect(css).toContain('--header-image:url("/uploads/banner.jpg")');
  });

  it("emits --bg-image url() for backgroundImage", () => {
    const css = buildThemeCssVars({ backgroundImage: "https://example.com/bg.png" });
    expect(css).toContain('--bg-image:url("https://example.com/bg.png")');
  });

  it("escapes double-quotes in image URLs", () => {
    const css = buildThemeCssVars({ headerImage: '/uploads/my"file.jpg' });
    expect(css).not.toContain('"my"file');
    expect(css).toContain("%22");
  });
});

describe("validateThemeFields", () => {
  it("returns ok:false for non-object input", () => {
    const result = validateThemeFields("not-an-object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["_"]).toBeDefined();
    }
  });

  it("returns ok:false for null", () => {
    const result = validateThemeFields(null);
    expect(result.ok).toBe(false);
  });

  it("returns ok:true with empty fields for an empty object", () => {
    const result = validateThemeFields({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.fields)).toHaveLength(0);
    }
  });

  it("accepts valid hex colors (3-digit)", () => {
    const result = validateThemeFields({ colorPrimary: "#fff" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.colorPrimary).toBe("#fff");
  });

  it("accepts valid hex colors (6-digit)", () => {
    const result = validateThemeFields({ colorPrimary: "#3b82f6" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.colorPrimary).toBe("#3b82f6");
  });

  it("rejects invalid hex color (no hash)", () => {
    const result = validateThemeFields({ colorPrimary: "3b82f6" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.colorPrimary).toBeDefined();
  });

  it("drops empty color fields (treated as unset)", () => {
    const result = validateThemeFields({ colorPrimary: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.colorPrimary).toBeUndefined();
  });

  it("accepts known font keys", () => {
    const result = validateThemeFields({ fontBody: "serif", fontHeading: "mono" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontBody).toBe("serif");
      expect(result.fields.fontHeading).toBe("mono");
    }
  });

  it("rejects unknown font key", () => {
    const result = validateThemeFields({ fontBody: "comic-sans" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.fontBody).toBeDefined();
  });

  it("drops empty font fields", () => {
    const result = validateThemeFields({ fontBody: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.fontBody).toBeUndefined();
  });

  it("accepts /uploads/ logo path", () => {
    const result = validateThemeFields({ logo: "/uploads/logo.png" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.logo).toBe("/uploads/logo.png");
  });

  it("accepts https URL for logo", () => {
    const result = validateThemeFields({ logo: "https://cdn.example.com/logo.png" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.logo).toBe("https://cdn.example.com/logo.png");
  });

  it("rejects relative path (not /uploads/) for logo", () => {
    const result = validateThemeFields({ logo: "../assets/logo.png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.logo).toBeDefined();
  });

  it("drops empty logo", () => {
    const result = validateThemeFields({ logo: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.logo).toBeUndefined();
  });

  it("includes showTagline:true when true", () => {
    const result = validateThemeFields({ showTagline: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.showTagline).toBe(true);
  });

  it("drops showTagline when false", () => {
    const result = validateThemeFields({ showTagline: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.showTagline).toBeUndefined();
  });

  it("includes headerLayout:center when center", () => {
    const result = validateThemeFields({ headerLayout: "center" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.headerLayout).toBe("center");
  });

  it("drops headerLayout when left (it is the default)", () => {
    const result = validateThemeFields({ headerLayout: "left" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.headerLayout).toBeUndefined();
  });

  it("rejects invalid headerLayout", () => {
    const result = validateThemeFields({ headerLayout: "top" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.headerLayout).toBeDefined();
  });

  it("passes customCss through without validation", () => {
    const css = "body { color: red; }";
    const result = validateThemeFields({ customCss: css });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.customCss).toBe(css);
  });

  it("drops empty customCss", () => {
    const result = validateThemeFields({ customCss: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields.customCss).toBeUndefined();
  });

  it("HEX_COLOR_RE matches 3-digit hex", () => {
    expect(HEX_COLOR_RE.test("#abc")).toBe(true);
  });

  it("HEX_COLOR_RE matches 6-digit hex", () => {
    expect(HEX_COLOR_RE.test("#aabbcc")).toBe(true);
  });

  it("HEX_COLOR_RE rejects 4-digit hex", () => {
    expect(HEX_COLOR_RE.test("#abcd")).toBe(false);
  });

  it("HEX_COLOR_RE rejects no-hash value", () => {
    expect(HEX_COLOR_RE.test("aabbcc")).toBe(false);
  });
});
