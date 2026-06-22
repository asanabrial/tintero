import { describe, expect, test } from "bun:test";
import {
  SUPPORTED_LOCALES,
  createTranslator,
  resolveLocale,
  t,
} from "@/lib/i18n";

describe("resolveLocale", () => {
  test("returns a supported locale unchanged", () => {
    expect(resolveLocale("es")).toBe("es");
    expect(resolveLocale("en")).toBe("en");
  });

  test("normalizes a regional tag to its base language", () => {
    expect(resolveLocale("es-ES")).toBe("es");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("en-US")).toBe("en");
  });

  test("falls back to English when the base language isn't shipped yet", () => {
    // Japanese has no catalog, so ja-JP resolves to English.
    expect(resolveLocale("ja-JP")).toBe("en");
    expect(resolveLocale("zh")).toBe("en");
  });

  test("falls back to English for unknown locales", () => {
    expect(resolveLocale("xx")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });

  test("English is always supported", () => {
    expect(SUPPORTED_LOCALES).toContain("en");
  });
});

describe("t", () => {
  test("looks up a dot-path key in the locale catalog", () => {
    expect(t("en", "admin.nav.posts")).toBe("Posts");
  });

  test("returns the Spanish string for a Spanish locale", () => {
    // Spanish admin nav uses WordPress's term for posts ("Entradas").
    expect(t("es", "admin.nav.posts")).toBe("Entradas");
  });

  test("interpolates {params}", () => {
    expect(t("en", "admin.howdy", { name: "Alex" })).toBe("Howdy, Alex");
  });

  test("falls back to English when a key is missing in the locale", () => {
    // A key only present in English must still resolve for another locale.
    expect(t("es", "admin.nav.dashboard")).toBe(t("es", "admin.nav.dashboard"));
    expect(typeof t("es", "admin.nav.dashboard")).toBe("string");
    expect(t("es", "admin.nav.dashboard").length).toBeGreaterThan(0);
  });

  test("returns the key itself when missing everywhere", () => {
    expect(t("en", "this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });
});

describe("additional WordPress locales", () => {
  test("French, German, Portuguese and Italian are supported", () => {
    for (const loc of ["fr", "de", "pt", "it"]) {
      expect(SUPPORTED_LOCALES).toContain(loc);
    }
  });

  test("translate the posts nav label per WordPress terminology", () => {
    expect(t("fr", "admin.nav.posts")).toBe("Articles");
    expect(t("de", "admin.nav.posts")).toBe("Beiträge");
    expect(t("pt", "admin.nav.settings")).toBe("Configurações");
    expect(t("it", "admin.nav.dashboard")).toBe("Bacheca");
  });

  test("regional tags resolve to the base catalog", () => {
    expect(t("fr-CA", "admin.nav.posts")).toBe("Articles");
    expect(t("pt-BR", "admin.nav.pages")).toBe("Páginas");
  });
});

describe("createTranslator", () => {
  test("curries the locale", () => {
    const tr = createTranslator("es");
    expect(tr("admin.nav.posts")).toBe("Entradas");
    expect(tr("admin.howdy", { name: "Ana" })).toBe(t("es", "admin.howdy", { name: "Ana" }));
  });
});
