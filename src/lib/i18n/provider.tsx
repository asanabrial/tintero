"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type Translator } from "./index";

// The active UI locale, provided once (from config.language) at the admin/site
// root and consumed by client components via useT().
const LocaleContext = createContext<string>("en");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The active locale string (e.g. "en", "es"). */
export function useLocale(): string {
  return useContext(LocaleContext);
}

/** A memoized translator bound to the active locale. */
export function useT(): Translator {
  const locale = useContext(LocaleContext);
  return useMemo(() => createTranslator(locale), [locale]);
}
