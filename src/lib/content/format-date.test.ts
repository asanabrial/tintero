import { describe, it, expect } from "bun:test";
import { formatSiteDate } from "./format-date";

describe("formatSiteDate", () => {
  describe("long preset", () => {
    it("formats 2025-01-15 in UTC as January 15, 2025", () => {
      expect(formatSiteDate("2025-01-15", { timezone: "UTC", dateFormat: "long" })).toBe("January 15, 2025");
    });
  });

  describe("medium preset", () => {
    it("formats 2025-01-15 in UTC as Jan 15, 2025", () => {
      expect(formatSiteDate("2025-01-15", { timezone: "UTC", dateFormat: "medium" })).toBe("Jan 15, 2025");
    });
  });

  describe("short preset", () => {
    it("formats 2025-01-15 in UTC as 1/15/25", () => {
      expect(formatSiteDate("2025-01-15", { timezone: "UTC", dateFormat: "short" })).toBe("1/15/25");
    });
  });

  describe("iso preset", () => {
    it("returns the first 10 chars of the input unchanged", () => {
      expect(formatSiteDate("2025-01-15", { timezone: "UTC", dateFormat: "iso" })).toBe("2025-01-15");
    });

    it("returns the first 10 chars even when a full ISO string is passed", () => {
      expect(formatSiteDate("2025-01-15T12:00:00Z", { timezone: "UTC", dateFormat: "iso" })).toBe("2025-01-15");
    });
  });

  describe("invalid input", () => {
    it("returns the raw input for garbage strings", () => {
      expect(formatSiteDate("not-a-date", { timezone: "UTC", dateFormat: "long" })).toBe("not-a-date");
    });
  });

  describe("timezone handling", () => {
    it("respects America/New_York: 2025-01-15T01:00:00Z is Jan 14 in UTC-5", () => {
      // 2025-01-15T01:00:00Z is 2025-01-14T20:00:00 in New York (UTC-5)
      expect(formatSiteDate("2025-01-15T01:00:00Z", { timezone: "America/New_York", dateFormat: "long" })).toBe("January 14, 2025");
    });
  });

  describe("unknown dateFormat fallback", () => {
    it("falls back to long behavior for unknown presets", () => {
      expect(formatSiteDate("2025-01-15", { timezone: "UTC", dateFormat: "unknown" })).toBe("January 15, 2025");
    });
  });
});
