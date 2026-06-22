import { describe, it, expect } from "bun:test";
import { themeFromFormValues } from "./theme-from-form-values";
import type { AppearanceFormInitial } from "./appearance-form";

const BASE: AppearanceFormInitial = {
  colorPrimary: "",
  colorAccent: "",
  colorHeaderBg: "",
  colorHeaderText: "",
  colorText: "",
  colorBackground: "",
  customCss: "",
  logo: "",
  favicon: "",
  fontBody: "",
  fontHeading: "",
  headerImage: "",
  backgroundImage: "",
  showTagline: false,
  headerLayout: "left",
};

describe("themeFromFormValues", () => {
  it("maps full values to a correct ThemeFields object", () => {
    const values: AppearanceFormInitial = {
      colorPrimary: "#3b82f6",
      colorAccent: "#f59e0b",
      colorHeaderBg: "#1e293b",
      colorHeaderText: "#f8fafc",
      colorText: "#111827",
      colorBackground: "#ffffff",
      customCss: "body { margin: 0; }",
      logo: "/uploads/logo.png",
      favicon: "/uploads/favicon.ico",
      fontBody: "serif",
      fontHeading: "mono",
      headerImage: "/uploads/banner.jpg",
      backgroundImage: "https://example.com/bg.jpg",
      showTagline: true,
      headerLayout: "center",
    };
    const theme = themeFromFormValues(values);
    expect(theme.colorPrimary).toBe("#3b82f6");
    expect(theme.colorAccent).toBe("#f59e0b");
    expect(theme.colorHeaderBg).toBe("#1e293b");
    expect(theme.colorHeaderText).toBe("#f8fafc");
    expect(theme.colorText).toBe("#111827");
    expect(theme.colorBackground).toBe("#ffffff");
    expect(theme.customCss).toBe("body { margin: 0; }");
    expect(theme.logo).toBe("/uploads/logo.png");
    expect(theme.favicon).toBe("/uploads/favicon.ico");
    expect(theme.fontBody).toBe("serif");
    expect(theme.fontHeading).toBe("mono");
    expect(theme.headerImage).toBe("/uploads/banner.jpg");
    expect(theme.backgroundImage).toBe("https://example.com/bg.jpg");
    expect(theme.showTagline).toBe(true);
    expect(theme.headerLayout).toBe("center");
  });

  it("omits empty color fields", () => {
    const theme = themeFromFormValues({ ...BASE, colorPrimary: "" });
    expect(theme.colorPrimary).toBeUndefined();
  });

  it("includes non-empty color fields", () => {
    const theme = themeFromFormValues({ ...BASE, colorPrimary: "#ff0000" });
    expect(theme.colorPrimary).toBe("#ff0000");
  });

  it("omits empty string logo", () => {
    const theme = themeFromFormValues({ ...BASE, logo: "" });
    expect(theme.logo).toBeUndefined();
  });

  it("includes non-empty logo", () => {
    const theme = themeFromFormValues({ ...BASE, logo: "/uploads/my-logo.png" });
    expect(theme.logo).toBe("/uploads/my-logo.png");
  });

  it("omits favicon when empty", () => {
    const theme = themeFromFormValues({ ...BASE, favicon: "" });
    expect(theme.favicon).toBeUndefined();
  });

  it("omits headerImage when empty", () => {
    const theme = themeFromFormValues({ ...BASE, headerImage: "" });
    expect(theme.headerImage).toBeUndefined();
  });

  it("omits backgroundImage when empty", () => {
    const theme = themeFromFormValues({ ...BASE, backgroundImage: "" });
    expect(theme.backgroundImage).toBeUndefined();
  });

  it("omits showTagline when false", () => {
    const theme = themeFromFormValues({ ...BASE, showTagline: false });
    expect(theme.showTagline).toBeUndefined();
  });

  it("includes showTagline when true", () => {
    const theme = themeFromFormValues({ ...BASE, showTagline: true });
    expect(theme.showTagline).toBe(true);
  });

  it("omits headerLayout when left (default)", () => {
    const theme = themeFromFormValues({ ...BASE, headerLayout: "left" });
    expect(theme.headerLayout).toBeUndefined();
  });

  it("includes headerLayout when center", () => {
    const theme = themeFromFormValues({ ...BASE, headerLayout: "center" });
    expect(theme.headerLayout).toBe("center");
  });

  it("omits fontBody when empty", () => {
    const theme = themeFromFormValues({ ...BASE, fontBody: "" });
    expect(theme.fontBody).toBeUndefined();
  });

  it("includes fontBody when set", () => {
    const theme = themeFromFormValues({ ...BASE, fontBody: "system" });
    expect(theme.fontBody).toBe("system");
  });

  it("omits fontHeading when empty", () => {
    const theme = themeFromFormValues({ ...BASE, fontHeading: "" });
    expect(theme.fontHeading).toBeUndefined();
  });

  it("includes fontHeading when set", () => {
    const theme = themeFromFormValues({ ...BASE, fontHeading: "humanist" });
    expect(theme.fontHeading).toBe("humanist");
  });

  it("omits customCss when empty string", () => {
    const theme = themeFromFormValues({ ...BASE, customCss: "" });
    expect(theme.customCss).toBeUndefined();
  });

  it("omits customCss when whitespace only", () => {
    const theme = themeFromFormValues({ ...BASE, customCss: "   " });
    expect(theme.customCss).toBeUndefined();
  });

  it("includes customCss when non-empty", () => {
    const theme = themeFromFormValues({ ...BASE, customCss: "h1 { color: red; }" });
    expect(theme.customCss).toBe("h1 { color: red; }");
  });

  it("trims whitespace from color values", () => {
    const theme = themeFromFormValues({ ...BASE, colorPrimary: "  #abc  " });
    expect(theme.colorPrimary).toBe("#abc");
  });

  it("trims whitespace from image URLs", () => {
    const theme = themeFromFormValues({ ...BASE, logo: "  /uploads/logo.png  " });
    expect(theme.logo).toBe("/uploads/logo.png");
  });

  it("returns an empty object for all-empty initial values", () => {
    const theme = themeFromFormValues(BASE);
    expect(Object.keys(theme)).toHaveLength(0);
  });
});
