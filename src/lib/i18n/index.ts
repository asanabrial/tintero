// i18n engine — WordPress model: a single site language (config.language) drives
// the whole UI. No locale-prefixed routing. Pure and dependency-free.

import { en, es, fr, de, pt, it } from "./messages";

// Locale → catalog. English is mandatory and is the fallback for every key.
// Stored loosely (unknown) because each locale's literal string types differ;
// lookups are structural by dot path, not type-driven.
const CATALOGS: Record<string, unknown> = { en, es, fr, de, pt, it };

export const SUPPORTED_LOCALES = Object.keys(CATALOGS) as readonly string[];

export const DEFAULT_LOCALE = "en";

// Human-readable language names (endonyms) for the Settings dropdown.
export const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
};

/** Supported locales as {code, name} pairs for a language picker. */
export function localeOptions(): { code: string; name: string }[] {
  return SUPPORTED_LOCALES.map((code) => ({ code, name: LOCALE_NAMES[code] ?? code }));
}

/**
 * Resolve any language tag (e.g. "es-ES", "pt-BR") to a supported locale by
 * trying the exact tag, then its base language, then English.
 */
export function resolveLocale(lang: string | undefined | null): string {
  if (!lang) return DEFAULT_LOCALE;
  const lower = lang.toLowerCase();
  if (CATALOGS[lower]) return lower;
  const base = lower.split("-")[0];
  if (CATALOGS[base]) return base;
  return DEFAULT_LOCALE;
}

function lookup(catalog: unknown, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Translate a dot-path key for a locale, interpolating {params}. Falls back to
 * English when the key is missing in the locale, and to the key itself when it
 * is missing everywhere.
 */
export function t(
  locale: string,
  key: string,
  params?: Record<string, string | number>
): string {
  const loc = resolveLocale(locale);
  const value = lookup(CATALOGS[loc], key) ?? lookup(en, key) ?? key;
  return interpolate(value, params);
}

export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** Curry the locale for ergonomic use in a component tree. */
export function createTranslator(locale: string): Translator {
  const loc = resolveLocale(locale);
  return (key, params) => t(loc, key, params);
}
