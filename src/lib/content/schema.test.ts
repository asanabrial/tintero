import { describe, it, expect } from "bun:test";
import { SiteConfigSchema } from "./schema";

describe("SiteConfigSchema — footerNav", () => {
  it("defaults footerNav to [] when not provided", () => {
    const result = SiteConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.footerNav).toEqual([]);
    }
  });

  it("existing config without footerNav is valid (backward compat)", () => {
    const result = SiteConfigSchema.safeParse({
      title: "My Blog",
      description: "A blog about stuff",
      baseUrl: "https://example.com",
      language: "en",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.footerNav).toEqual([]);
    }
  });

  it("footerNav with items validates successfully", () => {
    const result = SiteConfigSchema.safeParse({
      footerNav: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.footerNav).toHaveLength(2);
      expect(result.data.footerNav[0].label).toBe("Privacy");
      expect(result.data.footerNav[1].href).toBe("/terms");
    }
  });
});

describe("SiteConfigSchema timezone and dateFormat", () => {
  it("defaults timezone to UTC when not provided", () => {
    const result = SiteConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("UTC");
    }
  });

  it("defaults dateFormat to long when not provided", () => {
    const result = SiteConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateFormat).toBe("long");
    }
  });

  it("accepts explicit timezone and dateFormat values", () => {
    const result = SiteConfigSchema.safeParse({
      timezone: "America/New_York",
      dateFormat: "short",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe("America/New_York");
      expect(result.data.dateFormat).toBe("short");
    }
  });

  it("existing config without timezone/dateFormat still parses successfully", () => {
    const result = SiteConfigSchema.safeParse({
      title: "My Blog",
      description: "A blog about stuff",
      baseUrl: "https://example.com",
      language: "en",
    });
    expect(result.success).toBe(true);
  });
});
