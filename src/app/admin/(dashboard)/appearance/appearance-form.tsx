"use client";

import { useState, useActionState } from "react";
import { MediaPickerModal } from "calamo";
import { listMediaAction } from "../media/actions";
import type { AppearanceFormState } from "./actions";
import {
  Field,
  CheckboxField,
  FormAlert,
  TextInput,
  Textarea,
  SelectInput,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

export interface AppearanceFormInitial {
  colorPrimary: string;
  colorAccent: string;
  colorHeaderBg: string;
  colorHeaderText: string;
  colorText: string;
  colorBackground: string;
  customCss: string;
  logo: string;
  favicon: string;
  fontBody: string;
  fontHeading: string;
  headerImage: string;
  backgroundImage: string;
  showTagline: boolean;
  headerLayout: string;
}

export interface AppearanceFormProps {
  action: (
    prev: AppearanceFormState,
    formData: FormData
  ) => Promise<AppearanceFormState>;
  initial: AppearanceFormInitial;
  saved?: boolean;
  savedMsg?: string;
  submitLabel?: string;
  hideSubmit?: boolean;
  formId?: string;
  activeSection?: string | null;
}

type StringKeyOf<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

function colorFields(tr: (k: string) => string): { name: StringKeyOf<AppearanceFormInitial>; label: string }[] {
  return [
    { name: "colorPrimary", label: tr("admin.appearance.colorPrimary") },
    { name: "colorAccent", label: tr("admin.appearance.colorAccent") },
    { name: "colorHeaderBg", label: tr("admin.appearance.colorHeaderBg") },
    { name: "colorHeaderText", label: tr("admin.appearance.colorHeaderText") },
    { name: "colorText", label: tr("admin.appearance.colorText") },
    { name: "colorBackground", label: tr("admin.appearance.colorBackground") },
  ];
}

function fontOptions(tr: (k: string) => string): { value: string; label: string }[] {
  return [
    { value: "", label: tr("admin.appearance.fontDefault") },
    { value: "system", label: tr("admin.appearance.fontSystem") },
    { value: "sans", label: tr("admin.appearance.fontSans") },
    { value: "serif", label: tr("admin.appearance.fontSerif") },
    { value: "mono", label: tr("admin.appearance.fontMono") },
    { value: "humanist", label: tr("admin.appearance.fontHumanist") },
    { value: "rounded", label: tr("admin.appearance.fontRounded") },
    { value: "oldstyle", label: tr("admin.appearance.fontOldStyle") },
  ];
}

/**
 * AppearanceForm — client island for the admin appearance/customize screen.
 * Presentational only: owns form UX (pending state, field/global errors, success banner).
 * No data fetching, no auth, no FS imports.
 * Imports ThemeConfig shape via AppearanceFormInitial only — no barrel imports.
 */
export function AppearanceForm({
  action,
  initial,
  saved,
  savedMsg,
  submitLabel,
  hideSubmit,
  formId,
  activeSection,
}: AppearanceFormProps) {
  const [state, dispatch] = useActionState<AppearanceFormState, FormData>(
    action,
    undefined
  );
  const tr = useT();
  const colorFieldsList = colorFields(tr);
  const fontOptionsList = fontOptions(tr);

  const fieldErrors =
    state && "fieldErrors" in state ? state.fieldErrors : {};
  const globalError =
    state && "error" in state ? state.error : undefined;

  const [logo, setLogo] = useState(initial.logo);
  const [favicon, setFavicon] = useState(initial.favicon);
  const [headerImage, setHeaderImage] = useState(initial.headerImage);
  const [backgroundImage, setBackgroundImage] = useState(initial.backgroundImage);
  const [picker, setPicker] = useState<null | "logo" | "favicon" | "headerImage" | "backgroundImage">(null);

  // When activeSection is provided (shell-controlled), only show the matching fieldset.
  // Use hidden class (not unmount) so ALL form fields stay in the DOM for FormData.
  const sectionHidden = (key: string) =>
    activeSection !== undefined && activeSection !== null && activeSection !== key;

  return (
    <form action={dispatch} noValidate className="space-y-6" id={formId}>
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}
      {saved && (
        <FormAlert tone="success">{savedMsg ?? tr("admin.appearance.saved")}</FormAlert>
      )}

      {/* ── Colors ── */}
      <fieldset className={`border-0 p-0 m-0 space-y-4${sectionHidden("colors") ? " hidden" : ""}`}>
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">
          {tr("admin.appearance.colors")}
        </legend>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {tr("admin.appearance.colorsHint")}
        </p>
        {colorFieldsList.map(({ name, label }) => {
          const err = fieldErrors[name];
          const val = initial[name];
          return (
            <Field
              key={name}
              htmlFor={`appearance-${name}`}
              label={label}
              error={err}
              layout="stacked"
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${label} swatch`}
                  defaultValue={val || "#000000"}
                  onChange={(e) => {
                    const text = document.getElementById(
                      `appearance-${name}`
                    ) as HTMLInputElement | null;
                    if (text) {
                      // Set via the native setter + dispatch a bubbling input event
                      // so the live-preview customizer (which listens through a
                      // wrapping onChange) reacts to swatch changes. A plain
                      // `text.value = ...` assignment fires no event and would
                      // leave the live preview stale until the hex field is typed.
                      const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        "value"
                      )?.set;
                      setter?.call(text, e.target.value);
                      text.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  }}
                  className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent p-0"
                />
                <TextInput
                  id={`appearance-${name}`}
                  type="text"
                  name={name}
                  defaultValue={val}
                  placeholder={tr("admin.appearance.colorPlaceholder")}
                  aria-describedby={err ? `appearance-${name}-error` : undefined}
                />
              </div>
            </Field>
          );
        })}
      </fieldset>

      {/* ── Site Identity ── */}
      <fieldset className={`border-0 p-0 m-0 space-y-4${sectionHidden("site-identity") ? " hidden" : ""}`}>
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">
          {tr("admin.appearance.siteIdentity")}
        </legend>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {tr("admin.appearance.siteIdentityHint")}
        </p>

        {(
          [
            { name: "logo", label: tr("admin.appearance.logo"), value: logo, set: setLogo, key: "logo" as const },
            { name: "favicon", label: tr("admin.appearance.favicon"), value: favicon, set: setFavicon, key: "favicon" as const },
          ] as const
        ).map(({ name, label, value, set, key }: { name: string; label: string; value: string; set: (v: string) => void; key: "logo" | "favicon" }) => {
          const err = fieldErrors[name];
          return (
            <Field
              key={name}
              htmlFor={`appearance-${name}`}
              label={label}
              error={err}
              layout="stacked"
            >
              <div className="flex items-center gap-2">
                <TextInput
                  id={`appearance-${name}`}
                  type="text"
                  name={name}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={tr("admin.appearance.mediaPlaceholder")}
                  aria-describedby={err ? `appearance-${name}-error` : undefined}
                />
                <button
                  type="button"
                  onClick={() => setPicker(key)}
                  className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors"
                >
                  {tr("admin.editor.chooseFromMedia")}
                </button>
              </div>
              {value ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value}
                  alt={`${label} preview`}
                  className="mt-1 h-8 w-auto object-contain"
                />
              ) : null}
            </Field>
          );
        })}
      </fieldset>

      <MediaPickerModal
        open={picker !== null}
        listMedia={listMediaAction}
        onClose={() => setPicker(null)}
        onSelect={(asset) => {
          if (picker === "logo") setLogo(asset.url);
          else if (picker === "favicon") setFavicon(asset.url);
          else if (picker === "headerImage") setHeaderImage(asset.url);
          else if (picker === "backgroundImage") setBackgroundImage(asset.url);
          setPicker(null);
        }}
      />

      {/* ── Typography ── */}
      <fieldset className={`border-0 p-0 m-0 space-y-4${sectionHidden("typography") ? " hidden" : ""}`}>
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">
          {tr("admin.appearance.typography")}
        </legend>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {tr("admin.appearance.typographyHint")}
        </p>

        <Field
          htmlFor="appearance-fontBody"
          label={tr("admin.appearance.fontBody")}
          error={fieldErrors["fontBody"]}
          layout="stacked"
        >
          <SelectInput
            id="appearance-fontBody"
            name="fontBody"
            defaultValue={initial.fontBody}
            aria-describedby={
              fieldErrors["fontBody"] ? "appearance-fontBody-error" : undefined
            }
          >
            {fontOptionsList.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          htmlFor="appearance-fontHeading"
          label={tr("admin.appearance.fontHeading")}
          error={fieldErrors["fontHeading"]}
          layout="stacked"
        >
          <SelectInput
            id="appearance-fontHeading"
            name="fontHeading"
            defaultValue={initial.fontHeading}
            aria-describedby={
              fieldErrors["fontHeading"] ? "appearance-fontHeading-error" : undefined
            }
          >
            {fontOptionsList.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </fieldset>

      {/* ── Header & Background ── */}
      <fieldset className={`border-0 p-0 m-0 space-y-4${sectionHidden("header-background") ? " hidden" : ""}`}>
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">
          {tr("admin.appearance.headerBackground")}
        </legend>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {tr("admin.appearance.headerBackgroundHint")}
        </p>

        {(
          [
            {
              name: "headerImage",
              label: tr("admin.appearance.headerImage"),
              value: headerImage,
              set: setHeaderImage,
              key: "headerImage" as const,
            },
            {
              name: "backgroundImage",
              label: tr("admin.appearance.backgroundImage"),
              value: backgroundImage,
              set: setBackgroundImage,
              key: "backgroundImage" as const,
            },
          ] as const
        ).map(({ name, label, value, set, key }: { name: string; label: string; value: string; set: (v: string) => void; key: "headerImage" | "backgroundImage" }) => {
          const err = (fieldErrors as Record<string, string>)[name];
          return (
            <Field
              key={name}
              htmlFor={`appearance-${name}`}
              label={label}
              error={err}
              layout="stacked"
            >
              <div className="flex items-center gap-2">
                <TextInput
                  id={`appearance-${name}`}
                  type="text"
                  name={name}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={tr("admin.appearance.mediaPlaceholderNone")}
                  aria-describedby={err ? `appearance-${name}-error` : undefined}
                />
                <button
                  type="button"
                  onClick={() => setPicker(key)}
                  className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors"
                >
                  {tr("admin.editor.chooseFromMedia")}
                </button>
              </div>
              {value ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value}
                  alt={`${label} preview`}
                  className="mt-1 h-8 w-auto object-contain"
                />
              ) : null}
            </Field>
          );
        })}

        <Field
          htmlFor="appearance-headerLayout"
          label={tr("admin.appearance.headerLayout")}
          error={(fieldErrors as Record<string, string>)["headerLayout"]}
          layout="stacked"
        >
          <SelectInput
            id="appearance-headerLayout"
            name="headerLayout"
            defaultValue={initial.headerLayout}
            aria-describedby={
              (fieldErrors as Record<string, string>)["headerLayout"]
                ? "appearance-headerLayout-error"
                : undefined
            }
          >
            <option value="left">{tr("admin.appearance.headerLayoutLeft")}</option>
            <option value="center">{tr("admin.appearance.headerLayoutCenter")}</option>
          </SelectInput>
        </Field>

        <CheckboxField
          id="appearance-showTagline"
          name="showTagline"
          label={tr("admin.appearance.showTagline")}
          defaultChecked={initial.showTagline}
        />
      </fieldset>

      {/* ── Custom CSS ── */}
      <fieldset className={`border-0 p-0 m-0 space-y-4${sectionHidden("custom-css") ? " hidden" : ""}`}>
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">
          {tr("admin.appearance.customCss")}
        </legend>

        <Field
          htmlFor="appearance-customCss"
          label={tr("admin.appearance.customCss")}
          error={fieldErrors["customCss"]}
          layout="stacked"
        >
          <Textarea
            id="appearance-customCss"
            name="customCss"
            rows={8}
            defaultValue={initial.customCss}
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      </fieldset>

      {!hideSubmit && (
        <SubmitButton label={submitLabel ?? tr("admin.appearance.saveAppearance")} pendingLabel={tr("admin.common.saving")} />
      )}
    </form>
  );
}
