import { describe, it, expect } from "bun:test";
import {
  buildThemeCssVars,
  sanitizeCustomCss,
  validateThemeFields,
  isSafeMediaUrl,
  isKnownFontKey,
  isLightHex,
  themeColorScheme,
  FONT_STACKS,
} from "../../../src/lib/content/theme";

// ============================================================
// isLightHex / themeColorScheme
// ============================================================

describe("isLightHex", () => {
  it("treats white and near-white as light", () => {
    expect(isLightHex("#ffffff")).toBe(true);
    expect(isLightHex("#f8fafc")).toBe(true);
    expect(isLightHex("#fff")).toBe(true);
  });

  it("treats black and dark slate as dark", () => {
    expect(isLightHex("#000000")).toBe(false);
    expect(isLightHex("#0a0a0a")).toBe(false);
    expect(isLightHex("#1e293b")).toBe(false);
  });

  it("uses perceived brightness (green-weighted), not raw average", () => {
    // Pure blue is perceptually dark; pure green is light despite equal raw value.
    expect(isLightHex("#0000ff")).toBe(false);
    expect(isLightHex("#00ff00")).toBe(true);
  });
});

describe("themeColorScheme", () => {
  it("returns undefined when no page background is set", () => {
    expect(themeColorScheme(undefined)).toBeUndefined();
    expect(themeColorScheme(null)).toBeUndefined();
    expect(themeColorScheme({})).toBeUndefined();
    expect(themeColorScheme({ colorBackground: "" })).toBeUndefined();
  });

  it("returns undefined for an invalid hex (site keeps OS preference)", () => {
    expect(themeColorScheme({ colorBackground: "red" })).toBeUndefined();
    expect(themeColorScheme({ colorBackground: "#12" })).toBeUndefined();
  });

  it("maps a light background to the light scheme", () => {
    expect(themeColorScheme({ colorBackground: "#f8fafc" })).toBe("light");
  });

  it("maps a dark background to the dark scheme", () => {
    expect(themeColorScheme({ colorBackground: "#0f172a" })).toBe("dark");
  });
});

// ============================================================
// buildThemeCssVars
// ============================================================

describe("buildThemeCssVars", () => {
  it("returns empty string for undefined input", () => {
    expect(buildThemeCssVars(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(buildThemeCssVars({})).toBe("");
  });

  it("returns :root block for a single color field", () => {
    expect(buildThemeCssVars({ colorPrimary: "#e11d48" })).toBe(
      ":root{--color-primary:#e11d48}"
    );
  });

  it("includes multiple fields in stable order", () => {
    const result = buildThemeCssVars({
      colorPrimary: "#e11d48",
      colorAccent: "#0ea5e9",
    });
    expect(result).toContain("--color-primary:#e11d48");
    expect(result).toContain("--color-accent:#0ea5e9");
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });

  it("omits empty string fields", () => {
    const result = buildThemeCssVars({ colorPrimary: "", colorAccent: "#0ea5e9" });
    expect(result).not.toContain("--color-primary");
    expect(result).toContain("--color-accent:#0ea5e9");
  });

  it("omits undefined fields", () => {
    const result = buildThemeCssVars({ colorPrimary: undefined, colorAccent: "#0ea5e9" });
    expect(result).not.toContain("--color-primary");
    expect(result).toContain("--color-accent:#0ea5e9");
  });

  it("omits whitespace-only fields", () => {
    const result = buildThemeCssVars({ colorPrimary: "   ", colorAccent: "#0ea5e9" });
    expect(result).not.toContain("--color-primary");
    expect(result).toContain("--color-accent:#0ea5e9");
  });

  it("maps all 6 color fields to their correct CSS var names", () => {
    const result = buildThemeCssVars({
      colorPrimary: "#111111",
      colorAccent: "#222222",
      colorHeaderBg: "#333333",
      colorHeaderText: "#666666",
      colorText: "#444444",
      colorBackground: "#555555",
    });
    expect(result).toContain("--color-primary:#111111");
    expect(result).toContain("--color-accent:#222222");
    expect(result).toContain("--color-header-bg:#333333");
    expect(result).toContain("--color-header-text:#666666");
    expect(result).toContain("--color-text:#444444");
    expect(result).toContain("--color-bg:#555555");
  });

  it("validates and emits colorHeaderText (header text color)", () => {
    const validated = validateThemeFields({ colorHeaderText: "#abcdef" });
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.fields.colorHeaderText).toBe("#abcdef");
    }
    expect(buildThemeCssVars({ colorHeaderText: "#abcdef" })).toContain(
      "--color-header-text:#abcdef"
    );
  });
});

// ============================================================
// sanitizeCustomCss
// ============================================================

describe("sanitizeCustomCss", () => {
  it("returns empty string for undefined", () => {
    expect(sanitizeCustomCss(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(sanitizeCustomCss("")).toBe("");
  });

  it("passes plain CSS through unchanged", () => {
    const css = "body { color: red; } .foo { display: flex; }";
    expect(sanitizeCustomCss(css)).toBe(css);
  });

  it("neutralizes </style> (lowercase) — SECURITY", () => {
    const input = "a{}</style><script>x</script>";
    const result = sanitizeCustomCss(input);
    // The raw substring must NOT appear (case-insensitive check)
    expect(result.toLowerCase()).not.toContain("</style");
  });

  it("neutralizes </STYLE> (uppercase) — SECURITY", () => {
    const input = "a{}</STYLE><script>x</script>";
    const result = sanitizeCustomCss(input);
    expect(result.toLowerCase()).not.toContain("</style");
  });

  it("escapes </style to \\3C /style (CSS hex escape)", () => {
    const result = sanitizeCustomCss("a{}</style>b");
    expect(result).toContain("\\3C /style");
  });
});

// ============================================================
// validateThemeFields
// ============================================================

describe("validateThemeFields", () => {
  it("returns ok for empty object", () => {
    const result = validateThemeFields({});
    expect(result.ok).toBe(true);
  });

  it("returns ok for valid 6-digit hex colors", () => {
    const result = validateThemeFields({
      colorPrimary: "#e11d48",
      colorAccent: "#0ea5e9",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.colorPrimary).toBe("#e11d48");
      expect(result.fields.colorAccent).toBe("#0ea5e9");
    }
  });

  it("returns ok for valid 3-digit hex color", () => {
    const result = validateThemeFields({ colorPrimary: "#fff" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.colorPrimary).toBe("#fff");
    }
  });

  it("rejects named colors", () => {
    const result = validateThemeFields({ colorPrimary: "red" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["colorPrimary"]).toBeDefined();
      expect(result.fieldErrors["colorPrimary"].length).toBeGreaterThan(0);
    }
  });

  it("rejects non-hex strings", () => {
    const result = validateThemeFields({ colorAccent: "not-a-hex" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["colorAccent"]).toBeDefined();
    }
  });

  it("rejects malformed hex (#zzz)", () => {
    const result = validateThemeFields({ colorPrimary: "#zzz" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["colorPrimary"]).toBeDefined();
    }
  });

  it("accepts customCss passthrough regardless of content", () => {
    const result = validateThemeFields({
      customCss: "body { color: red; } </style><script>x</script>",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.customCss).toBeDefined();
    }
  });

  it("returns ok for non-object (undefined) with fieldErrors._", () => {
    const result = validateThemeFields(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["_"]).toBeDefined();
    }
  });

  it("drops empty color fields (does not include them in fields)", () => {
    const result = validateThemeFields({ colorPrimary: "", colorAccent: "#0ea5e9" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.colorPrimary).toBeUndefined();
      expect(result.fields.colorAccent).toBe("#0ea5e9");
    }
  });

  it("collects multiple field errors simultaneously", () => {
    const result = validateThemeFields({
      colorPrimary: "red",
      colorAccent: "#12", // too short
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["colorPrimary"]).toBeDefined();
      expect(result.fieldErrors["colorAccent"]).toBeDefined();
    }
  });
});

// ============================================================
// isSafeMediaUrl
// ============================================================

describe("isSafeMediaUrl", () => {
  it("accepts /uploads/ path", () => {
    expect(isSafeMediaUrl("/uploads/logo.png")).toBe(true);
  });

  it("accepts http URL", () => {
    expect(isSafeMediaUrl("http://cdn.example.com/logo.png")).toBe(true);
  });

  it("accepts https URL", () => {
    expect(isSafeMediaUrl("https://cdn.example.com/logo.png")).toBe(true);
  });

  it("rejects javascript: scheme — SECURITY", () => {
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URI — SECURITY", () => {
    expect(isSafeMediaUrl("data:text/html,<h1>x</h1>")).toBe(false);
  });

  it("rejects relative path (non-uploads)", () => {
    expect(isSafeMediaUrl("relative.png")).toBe(false);
  });

  it("rejects traversal path (non-uploads)", () => {
    expect(isSafeMediaUrl("../etc/passwd")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeMediaUrl("")).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    expect(isSafeMediaUrl("   ")).toBe(false);
  });
});

// ============================================================
// validateThemeFields — logo and favicon
// ============================================================

describe("validateThemeFields — logo and favicon", () => {
  it("keeps valid /uploads/ logo and https favicon", () => {
    const result = validateThemeFields({
      logo: "/uploads/logo.png",
      favicon: "https://example.com/icon.png",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.logo).toBe("/uploads/logo.png");
      expect(result.fields.favicon).toBe("https://example.com/icon.png");
    }
  });

  it("returns fieldError for invalid logo URL", () => {
    const result = validateThemeFields({ logo: "javascript:evil" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["logo"]).toBeDefined();
      expect(result.fieldErrors["logo"].length).toBeGreaterThan(0);
    }
  });

  it("returns fieldError for invalid favicon URL", () => {
    const result = validateThemeFields({ favicon: "data:image/png;base64,xx" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["favicon"]).toBeDefined();
    }
  });

  it("omits logo and favicon when empty (unset, not an error)", () => {
    const result = validateThemeFields({ logo: "", favicon: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.logo).toBeUndefined();
      expect(result.fields.favicon).toBeUndefined();
    }
  });

  it("mixed: valid logo + invalid favicon → ok:false with only favicon error", () => {
    const result = validateThemeFields({
      logo: "/uploads/logo.png",
      favicon: "javascript:evil",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["favicon"]).toBeDefined();
      expect(result.fieldErrors["logo"]).toBeUndefined();
    }
  });
});

// ============================================================
// isKnownFontKey
// ============================================================

describe("isKnownFontKey", () => {
  it("returns true for all 7 known keys", () => {
    const keys: string[] = [
      "system",
      "sans",
      "serif",
      "mono",
      "humanist",
      "rounded",
      "oldstyle",
    ];
    for (const k of keys) {
      expect(isKnownFontKey(k)).toBe(true);
    }
  });

  it("returns false for unknown font name 'wingdings'", () => {
    expect(isKnownFontKey("wingdings")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isKnownFontKey("")).toBe(false);
  });

  it("returns false for '__proto__' (prototype-pollution guard)", () => {
    expect(isKnownFontKey("__proto__")).toBe(false);
  });

  it("returns false for 'toString' (prototype-chain guard)", () => {
    expect(isKnownFontKey("toString")).toBe(false);
  });

  it("returns false for 'constructor' (prototype-chain guard)", () => {
    expect(isKnownFontKey("constructor")).toBe(false);
  });

  it("returns false for 'times-new-roman' (unknown key)", () => {
    expect(isKnownFontKey("times-new-roman")).toBe(false);
  });
});

// ============================================================
// buildThemeCssVars — fontBody
// ============================================================

describe("buildThemeCssVars — fontBody", () => {
  it("serif key emits --font-body and --font-sans with the serif stack", () => {
    const result = buildThemeCssVars({ fontBody: "serif" });
    expect(result).toContain("--font-body:" + FONT_STACKS.serif);
    expect(result).toContain("--font-sans:" + FONT_STACKS.serif);
  });

  it("system key emits --font-body and --font-sans with the system stack", () => {
    const result = buildThemeCssVars({ fontBody: "system" });
    expect(result).toContain("--font-body:" + FONT_STACKS.system);
    expect(result).toContain("--font-sans:" + FONT_STACKS.system);
  });

  it("empty object emits neither --font-body nor --font-sans", () => {
    const result = buildThemeCssVars({});
    expect(result).not.toContain("--font-body");
    expect(result).not.toContain("--font-sans");
  });

  it("empty fontBody emits neither --font-body nor --font-sans", () => {
    const result = buildThemeCssVars({ fontBody: "" });
    expect(result).not.toContain("--font-body");
    expect(result).not.toContain("--font-sans");
  });

  it("unknown fontBody value emits neither --font-body nor --font-sans", () => {
    const result = buildThemeCssVars({ fontBody: "hacker" });
    expect(result).not.toContain("--font-body");
    expect(result).not.toContain("--font-sans");
  });

  it("color + serif together → all vars present in one :root block", () => {
    const result = buildThemeCssVars({ colorPrimary: "#111", fontBody: "serif" });
    expect(result).toContain("--color-primary:#111");
    expect(result).toContain("--font-body:" + FONT_STACKS.serif);
    expect(result).toContain("--font-sans:" + FONT_STACKS.serif);
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });
});

// ============================================================
// validateThemeFields — fontBody
// ============================================================

describe("validateThemeFields — fontBody", () => {
  it("valid key 'serif' → ok:true, fields.fontBody === 'serif'", () => {
    const result = validateThemeFields({ fontBody: "serif" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontBody).toBe("serif");
    }
  });

  it("unknown key 'wingdings' → ok:false, fieldErrors.fontBody defined", () => {
    const result = validateThemeFields({ fontBody: "wingdings" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["fontBody"]).toBeDefined();
      expect(result.fieldErrors["fontBody"].length).toBeGreaterThan(0);
    }
  });

  it("empty fontBody → ok:true, fields.fontBody undefined (dropped, not errored)", () => {
    const result = validateThemeFields({ fontBody: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontBody).toBeUndefined();
    }
  });

  it("valid color + valid font → ok:true, both fields present", () => {
    const result = validateThemeFields({ colorPrimary: "#fff", fontBody: "serif" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.colorPrimary).toBe("#fff");
      expect(result.fields.fontBody).toBe("serif");
    }
  });

  it("invalid color + invalid font → ok:false, both errors present", () => {
    const result = validateThemeFields({ colorPrimary: "red", fontBody: "wingdings" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["colorPrimary"]).toBeDefined();
      expect(result.fieldErrors["fontBody"]).toBeDefined();
    }
  });
});

// ============================================================
// buildThemeCssVars — fontHeading
// ============================================================

describe("buildThemeCssVars — fontHeading", () => {
  it("serif key emits --font-heading with the serif stack and does NOT emit --font-sans or --font-body", () => {
    const result = buildThemeCssVars({ fontHeading: "serif" });
    expect(result).toContain("--font-heading:" + FONT_STACKS.serif);
    expect(result).not.toContain("--font-sans");
    expect(result).not.toContain("--font-body");
  });

  it("mono key emits --font-heading with the mono stack and does NOT emit --font-sans", () => {
    const result = buildThemeCssVars({ fontHeading: "mono" });
    expect(result).toContain("--font-heading:" + FONT_STACKS.mono);
    expect(result).not.toContain("--font-sans");
  });

  it("empty object emits no --font-heading", () => {
    const result = buildThemeCssVars({});
    expect(result).not.toContain("--font-heading");
  });

  it("empty fontHeading emits no --font-heading", () => {
    const result = buildThemeCssVars({ fontHeading: "" });
    expect(result).not.toContain("--font-heading");
  });

  it("unknown fontHeading 'hacker' emits no --font-heading", () => {
    const result = buildThemeCssVars({ fontHeading: "hacker" });
    expect(result).not.toContain("--font-heading");
  });

  it("'__proto__' fontHeading emits no --font-heading (prototype-pollution guard)", () => {
    const result = buildThemeCssVars({ fontHeading: "__proto__" });
    expect(result).not.toContain("--font-heading");
  });

  it("ORTHOGONALITY: fontBody + fontHeading both present — all four vars in one :root block", () => {
    const result = buildThemeCssVars({ fontBody: "serif", fontHeading: "mono" });
    // body branch
    expect(result).toContain("--font-body:" + FONT_STACKS.serif);
    expect(result).toContain("--font-sans:" + FONT_STACKS.serif);
    // heading branch — own var only, distinct stack
    expect(result).toContain("--font-heading:" + FONT_STACKS.mono);
    // single :root block
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });

  it("ORTHOGONALITY: color + fontHeading both present in single :root block", () => {
    const result = buildThemeCssVars({ colorPrimary: "#111", fontHeading: "serif" });
    expect(result).toContain("--color-primary:#111");
    expect(result).toContain("--font-heading:" + FONT_STACKS.serif);
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });
});

// ============================================================
// validateThemeFields — fontHeading
// ============================================================

describe("validateThemeFields — fontHeading", () => {
  it("valid key 'humanist' → ok:true, fields.fontHeading === 'humanist'", () => {
    const result = validateThemeFields({ fontHeading: "humanist" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontHeading).toBe("humanist");
    }
  });

  it("unknown key 'comic-sans' → ok:false, fieldErrors.fontHeading is non-empty", () => {
    const result = validateThemeFields({ fontHeading: "comic-sans" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["fontHeading"]).toBeDefined();
      expect(result.fieldErrors["fontHeading"].length).toBeGreaterThan(0);
    }
  });

  it("empty fontHeading → ok:true, fields.fontHeading undefined (dropped, not errored)", () => {
    const result = validateThemeFields({ fontHeading: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontHeading).toBeUndefined();
    }
  });

  it("fontBody + fontHeading both valid → ok:true, both fields survive independently", () => {
    const result = validateThemeFields({ fontBody: "mono", fontHeading: "serif" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.fontBody).toBe("mono");
      expect(result.fields.fontHeading).toBe("serif");
    }
  });

  it("valid fontBody + invalid fontHeading → ok:false, fontHeading error present, fontBody not affected", () => {
    const result = validateThemeFields({ fontBody: "sans", fontHeading: "injection" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["fontHeading"]).toBeDefined();
      expect(result.fieldErrors["fontBody"]).toBeUndefined();
    }
  });
});

// ============================================================
// buildThemeCssVars — backgroundImage
// ============================================================

describe("buildThemeCssVars — backgroundImage", () => {
  it("emits --bg-image for a /uploads/ path", () => {
    const result = buildThemeCssVars({ backgroundImage: "/uploads/bg.jpg" });
    expect(result).toContain('--bg-image:url("/uploads/bg.jpg")');
  });

  it("emits --bg-image for an https URL", () => {
    const result = buildThemeCssVars({ backgroundImage: "https://cdn.example.com/bg.jpg" });
    expect(result).toContain('--bg-image:url("https://cdn.example.com/bg.jpg")');
  });

  it("does NOT emit --bg-image when backgroundImage is absent", () => {
    const result = buildThemeCssVars({});
    expect(result).not.toContain("--bg-image");
  });

  it("does NOT emit --bg-image when backgroundImage is empty string", () => {
    const result = buildThemeCssVars({ backgroundImage: "" });
    expect(result).not.toContain("--bg-image");
  });

  it("backgroundImage + colorPrimary → both vars in one :root block", () => {
    const result = buildThemeCssVars({ colorPrimary: "#111", backgroundImage: "/uploads/bg.jpg" });
    expect(result).toContain("--color-primary:#111");
    expect(result).toContain('--bg-image:url("/uploads/bg.jpg")');
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });
});

// ============================================================
// validateThemeFields — headerImage and backgroundImage
// ============================================================

describe("validateThemeFields — headerImage and backgroundImage", () => {
  it("accepts valid /uploads/ headerImage", () => {
    const result = validateThemeFields({ headerImage: "/uploads/header.jpg" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.headerImage).toBe("/uploads/header.jpg");
    }
  });

  it("accepts valid https backgroundImage", () => {
    const result = validateThemeFields({ backgroundImage: "https://cdn.example.com/bg.png" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.backgroundImage).toBe("https://cdn.example.com/bg.png");
    }
  });

  it("rejects javascript: headerImage — SECURITY", () => {
    const result = validateThemeFields({ headerImage: "javascript:evil()" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["headerImage"]).toBeDefined();
    }
  });

  it("rejects data: backgroundImage — SECURITY", () => {
    const result = validateThemeFields({ backgroundImage: "data:image/png;base64,xx" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["backgroundImage"]).toBeDefined();
    }
  });

  it("omits headerImage when empty (unset, not an error)", () => {
    const result = validateThemeFields({ headerImage: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.headerImage).toBeUndefined();
    }
  });

  it("omits backgroundImage when empty (unset, not an error)", () => {
    const result = validateThemeFields({ backgroundImage: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.backgroundImage).toBeUndefined();
    }
  });

  it("valid headerImage + invalid backgroundImage → ok:false, only backgroundImage error", () => {
    const result = validateThemeFields({
      headerImage: "/uploads/h.jpg",
      backgroundImage: "javascript:evil",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["backgroundImage"]).toBeDefined();
      expect(result.fieldErrors["headerImage"]).toBeUndefined();
    }
  });
});

// ============================================================
// validateThemeFields — showTagline and headerLayout
// ============================================================

describe("validateThemeFields — showTagline and headerLayout", () => {
  it("accepts showTagline: true", () => {
    const result = validateThemeFields({ showTagline: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.showTagline).toBe(true);
    }
  });

  it("accepts showTagline: false", () => {
    const result = validateThemeFields({ showTagline: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // false is the default → may be undefined or false
      expect(result.fields.showTagline === false || result.fields.showTagline === undefined).toBe(true);
    }
  });

  it("accepts headerLayout: 'center'", () => {
    const result = validateThemeFields({ headerLayout: "center" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.headerLayout).toBe("center");
    }
  });

  it("accepts headerLayout: 'left'", () => {
    const result = validateThemeFields({ headerLayout: "left" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 'left' is the default → may be undefined or 'left'
      expect(result.fields.headerLayout === "left" || result.fields.headerLayout === undefined).toBe(true);
    }
  });

  it("rejects invalid headerLayout value", () => {
    const result = validateThemeFields({ headerLayout: "diagonal" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["headerLayout"]).toBeDefined();
    }
  });

  it("omits showTagline when absent (backward compatible)", () => {
    const result = validateThemeFields({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.showTagline).toBeUndefined();
    }
  });

  it("omits headerLayout when absent (backward compatible)", () => {
    const result = validateThemeFields({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.headerLayout).toBeUndefined();
    }
  });
});

// ============================================================
// ThemeConfigSchema — 4 new fields
// ============================================================

import { ThemeConfigSchema, SiteConfigSchema } from "../../../src/lib/content/schema";

describe("ThemeConfigSchema — new appearance fields", () => {
  it("accepts headerImage as /uploads/ path", () => {
    const result = ThemeConfigSchema.safeParse({ headerImage: "/uploads/header.jpg" });
    expect(result.success).toBe(true);
  });

  it("accepts backgroundImage as https URL", () => {
    const result = ThemeConfigSchema.safeParse({ backgroundImage: "https://cdn.example.com/bg.jpg" });
    expect(result.success).toBe(true);
  });

  it("accepts showTagline: true", () => {
    const result = ThemeConfigSchema.safeParse({ showTagline: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showTagline).toBe(true);
    }
  });

  it("accepts headerLayout: 'center'", () => {
    const result = ThemeConfigSchema.safeParse({ headerLayout: "center" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.headerLayout).toBe("center");
    }
  });

  it("rejects headerImage with javascript: scheme", () => {
    const result = ThemeConfigSchema.safeParse({ headerImage: "javascript:evil" });
    expect(result.success).toBe(false);
  });

  it("rejects backgroundImage with data: scheme", () => {
    const result = ThemeConfigSchema.safeParse({ backgroundImage: "data:image/png;xx" });
    expect(result.success).toBe(false);
  });

  it("rejects headerLayout: 'diagonal'", () => {
    const result = ThemeConfigSchema.safeParse({ headerLayout: "diagonal" });
    expect(result.success).toBe(false);
  });

  it("empty object still passes (all new fields optional, backward compatible)", () => {
    const result = ThemeConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("existing site.yaml without theme block still works (SiteConfigSchema)", () => {
    const result = SiteConfigSchema.safeParse({ title: "My Blog" });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// buildThemeCssVars — headerImage (--header-image CSS var)
// ============================================================

describe("buildThemeCssVars — headerImage", () => {
  it("emits --header-image for a /uploads/ path", () => {
    const result = buildThemeCssVars({ headerImage: "/uploads/header.jpg" });
    expect(result).toContain('--header-image:url("/uploads/header.jpg")');
  });

  it("emits --header-image for an https URL", () => {
    const result = buildThemeCssVars({ headerImage: "https://cdn.example.com/banner.jpg" });
    expect(result).toContain('--header-image:url("https://cdn.example.com/banner.jpg")');
  });

  it("does NOT emit --header-image when headerImage is absent", () => {
    const result = buildThemeCssVars({});
    expect(result).not.toContain("--header-image");
  });

  it("does NOT emit --header-image when headerImage is empty string", () => {
    const result = buildThemeCssVars({ headerImage: "" });
    expect(result).not.toContain("--header-image");
  });

  it("does NOT emit --header-image when headerImage is whitespace", () => {
    const result = buildThemeCssVars({ headerImage: "   " });
    expect(result).not.toContain("--header-image");
  });

  it("headerImage + colorPrimary → both vars in one :root block", () => {
    const result = buildThemeCssVars({ colorPrimary: "#111", headerImage: "/uploads/header.jpg" });
    expect(result).toContain("--color-primary:#111");
    expect(result).toContain('--header-image:url("/uploads/header.jpg")');
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });

  it("headerImage + backgroundImage → both image vars in one :root block", () => {
    const result = buildThemeCssVars({
      headerImage: "/uploads/header.jpg",
      backgroundImage: "/uploads/bg.jpg",
    });
    expect(result).toContain('--header-image:url("/uploads/header.jpg")');
    expect(result).toContain('--bg-image:url("/uploads/bg.jpg")');
    expect(result.startsWith(":root{")).toBe(true);
    expect(result.endsWith("}")).toBe(true);
  });
});

// ============================================================
// buildThemeCssVars — image URL CSS injection safety
// ============================================================

describe("buildThemeCssVars — image URL CSS injection safety", () => {
  it('escapes double-quote in backgroundImage URL (CSS injection guard)', () => {
    // A value like /uploads/x"y.jpg would break out of url("...") context.
    // isSafeMediaUrl already rejects non-uploads/non-https values, but we
    // escape defensively at render time too.
    const result = buildThemeCssVars({ backgroundImage: '/uploads/x"y.jpg' });
    expect(result).not.toContain('"y.jpg"');
    expect(result).toContain("--bg-image");
  });

  it("escapes closing-paren in backgroundImage URL (CSS injection guard)", () => {
    const result = buildThemeCssVars({ backgroundImage: "/uploads/x)y.jpg" });
    expect(result).not.toContain(")y.jpg)");
    expect(result).toContain("--bg-image");
  });

  it("escapes newline in backgroundImage URL (CSS injection guard)", () => {
    const result = buildThemeCssVars({ backgroundImage: "/uploads/x\ny.jpg" });
    // After escaping, the raw newline must not appear in the output var value
    expect(result).not.toMatch(/--bg-image:url\("[^"]*\n/);
    expect(result).toContain("--bg-image");
  });

  it('escapes double-quote in headerImage URL (CSS injection guard)', () => {
    const result = buildThemeCssVars({ headerImage: '/uploads/h"eader.jpg' });
    expect(result).not.toContain('"eader.jpg"');
    expect(result).toContain("--header-image");
  });

  it("escapes closing-paren in headerImage URL (CSS injection guard)", () => {
    const result = buildThemeCssVars({ headerImage: "/uploads/h)eader.jpg" });
    expect(result).not.toContain(")eader.jpg)");
    expect(result).toContain("--header-image");
  });

  it("escapes newline in headerImage URL (CSS injection guard)", () => {
    const result = buildThemeCssVars({ headerImage: "/uploads/h\neader.jpg" });
    expect(result).not.toMatch(/--header-image:url\("[^"]*\n/);
    expect(result).toContain("--header-image");
  });
});
