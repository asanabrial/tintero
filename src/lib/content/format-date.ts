export type DateFormatPreset = "long" | "medium" | "short" | "iso";

/**
 * Formats a date string using the configured timezone and format preset.
 *
 * Rules:
 * - Invalid input (NaN date) returns the raw input string unchanged.
 * - "iso" preset returns isoDate.slice(0, 10) — NOT timezone-adjusted.
 * - Unknown/absent preset falls back to "long".
 * - Always passes timeZone to Intl.DateTimeFormat (defaults to "UTC").
 * - If Intl.DateTimeFormat throws (e.g. invalid timezone), returns isoDate.
 * - Never calls new Date() of "now" — pure function, same inputs → same output.
 */
export function formatSiteDate(
  isoDate: string,
  opts: { timezone?: string; dateFormat?: string; locale?: string }
): string {
  const { timezone = "UTC", dateFormat, locale = "en" } = opts;

  // "iso" preset: return the date portion of the input string directly
  if (dateFormat === "iso") {
    return isoDate.slice(0, 10);
  }

  // Parse the date
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return isoDate;
  }

  // Resolve preset → dateStyle
  const VALID_PRESETS = ["long", "medium", "short"] as const;
  type ValidPreset = (typeof VALID_PRESETS)[number];
  const preset: ValidPreset = VALID_PRESETS.includes(dateFormat as ValidPreset)
    ? (dateFormat as ValidPreset)
    : "long";

  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: preset,
      timeZone: timezone,
    }).format(d);
  } catch {
    return isoDate;
  }
}
