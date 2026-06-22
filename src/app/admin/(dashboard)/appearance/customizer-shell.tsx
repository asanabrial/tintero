"use client";

import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { AppearanceForm, type AppearanceFormProps, type AppearanceFormInitial } from "./appearance-form";
import { themeFromFormValues } from "./theme-from-form-values";
import { useT } from "@/lib/i18n/provider";

export { themeFromFormValues } from "./theme-from-form-values";

type SectionKey = "site-identity" | "colors" | "typography" | "header-background" | "custom-css";

type Device = "desktop" | "tablet" | "mobile";

interface CustomizerShellProps extends AppearanceFormProps {
  siteTitle?: string;
}

/**
 * CustomizerShell — full-screen WP-style customizer overlay.
 *
 * Left panel: header + section nav (home/section views with slide animation) + device footer.
 * Right pane: live preview iframe, sized by device toggle.
 *
 * Form changes are captured via bubbling onChange on the wrapper div, debounced
 * ~120ms, then postMessage'd to the iframe so CustomizePreview can apply them
 * without a page reload.
 *
 * The form stays uncontrolled (defaultValue). The shell only reads values
 * from DOM events for postMessage — it does NOT need to control every input for
 * the save path (that flows through the server action via FormData as usual).
 */
export function CustomizerShell({ action, initial, saved, savedMsg, siteTitle }: CustomizerShellProps) {
  const tr = useT();

  const sections = [
    { key: "site-identity" as SectionKey, label: tr("admin.appearance.siteIdentity") },
    { key: "colors" as SectionKey, label: tr("admin.appearance.colors") },
    { key: "typography" as SectionKey, label: tr("admin.appearance.typography") },
    { key: "header-background" as SectionKey, label: tr("admin.appearance.headerBackground") },
    { key: "custom-css" as SectionKey, label: tr("admin.appearance.customCss") },
  ];

  const deviceLabels: Record<Device, string> = {
    desktop: tr("admin.appearance.deviceDesktop"),
    tablet: tr("admin.appearance.deviceTablet"),
    mobile: tr("admin.appearance.deviceMobile"),
  };

  // Mutable snapshot of current form values used for postMessage.
  // We keep this in a ref (not state) because we only need it for debounced
  // postMessage, not for re-rendering — this avoids unnecessary re-renders on
  // every keystroke while the user types.
  const valuesRef = useRef<AppearanceFormInitial>({ ...initial });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `activeSection` drives the slide transform (panel in/out). `displaySection`
  // drives which fieldset the form shows, and lags behind on close so the
  // outgoing panel keeps rendering the SAME section while it slides away —
  // otherwise the form would flash every section at once during the 200ms
  // slide-out (sectionHidden() shows all fieldsets when the section is null).
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [displaySection, setDisplaySection] = useState<SectionKey | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  const openSection = useCallback((key: SectionKey) => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDisplaySection(key);
    setActiveSection(key);
  }, []);

  const closeSection = useCallback(() => {
    setActiveSection(null);
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    // Clear the rendered section only after the slide-out finishes (200ms transition).
    closeTimerRef.current = setTimeout(() => {
      setDisplaySection(null);
      closeTimerRef.current = null;
    }, 220);
  }, []);

  const sendPreview = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const theme = themeFromFormValues(valuesRef.current);
    iframe.contentWindow.postMessage(
      { type: "customize-preview", theme },
      window.location.origin
    );
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLDivElement>) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const { name, value } = target;
      if (!name) return;

      const isCheckbox =
        target instanceof HTMLInputElement && target.type === "checkbox";
      const newValue = isCheckbox
        ? (target as HTMLInputElement).checked
        : value;

      valuesRef.current = {
        ...valuesRef.current,
        [name]: newValue,
      } as AppearanceFormInitial;

      // Debounce the postMessage ~120ms.
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(sendPreview, 120);
    },
    [sendPreview]
  );

  // Home view slides out to the left when a section is active; section view slides in from right.
  const homeStyle: React.CSSProperties = {
    transform: activeSection !== null ? "translateX(-100%)" : "translateX(0)",
  };
  const sectionStyle: React.CSSProperties = {
    transform: activeSection !== null ? "translateX(0)" : "translateX(100%)",
  };

  // iframe sizing by device
  const iframeClass =
    device === "desktop"
      ? "w-full h-full border-0"
      : device === "tablet"
        ? "w-[768px] h-full max-h-full border-0 shadow-lg rounded-t-lg"
        : "w-[375px] h-full max-h-full border-0 shadow-lg rounded-t-lg";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Left panel */}
      <div className="w-80 shrink-0 flex flex-col bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700">
        {/* Header bar */}
        <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 min-h-[48px]">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin"
              aria-label={tr("admin.appearance.closeCustomizer")}
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              ✕
            </Link>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-none">{tr("admin.appearance.customizing")}</p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate leading-snug">
                {siteTitle ?? tr("admin.appearance.site")}
              </p>
            </div>
          </div>
          <button
            type="submit"
            form="customizer-form"
            className="shrink-0 ml-2 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            {tr("admin.appearance.saveAppearance")}
          </button>
        </div>

        {/* Navigation area — home view + section view, both always in DOM */}
        <div className="flex-1 overflow-hidden relative">
          {/* HOME VIEW */}
          <div
            className="absolute inset-0 transition-transform duration-200 ease-in-out overflow-y-auto"
            style={homeStyle}
          >
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => openSection(section.key)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800"
              >
                <span>{section.label}</span>
                <span className="text-zinc-400 dark:text-zinc-500" aria-hidden="true">›</span>
              </button>
            ))}
          </div>

          {/* SECTION VIEW */}
          <div
            className="absolute inset-0 transition-transform duration-200 ease-in-out flex flex-col"
            style={sectionStyle}
          >
            {/* Back button */}
            <button
              type="button"
              onClick={closeSection}
              className="w-full shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700"
            >
              <span aria-hidden="true">‹</span>
              {tr("admin.appearance.back")}
            </button>

            {/* Section form — scrollable */}
            <div
              className="flex-1 overflow-y-auto p-4"
              // Cast needed: HTMLDivElement onChange is not a standard DOM prop in React's
              // type defs but it works because synthetic onChange bubbles from all children.
              onChange={handleChange as unknown as React.ChangeEventHandler<HTMLDivElement>}
            >
              <AppearanceForm
                action={action}
                initial={initial}
                saved={saved}
                savedMsg={savedMsg ?? tr("admin.appearance.saved")}
                hideSubmit
                formId="customizer-form"
                activeSection={displaySection}
              />
            </div>
          </div>
        </div>

        {/* Footer — device toggles */}
        <div className="shrink-0 flex gap-1 p-2 border-t border-zinc-200 dark:border-zinc-700">
          {(["desktop", "tablet", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className="flex-1 py-1.5 text-xs rounded capitalize text-zinc-600 dark:text-zinc-400 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:aria-pressed:bg-zinc-50 dark:aria-pressed:text-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {deviceLabels[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Preview pane */}
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center min-w-0 overflow-hidden">
        <iframe
          ref={iframeRef}
          src="/?customize-preview=1"
          title={tr("admin.appearance.livePreview")}
          className={iframeClass}
          style={{ minHeight: "600px" }}
        />
      </div>
    </div>
  );
}
