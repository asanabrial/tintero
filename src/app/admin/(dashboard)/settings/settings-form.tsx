"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { SettingsFormState } from "./actions";
import {
  Field,
  FormAlert,
  FormSection,
  FormActions,
  TextInput,
  Textarea,
  SelectInput,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { localeOptions } from "@/lib/i18n";
import { useT } from "@/lib/i18n/provider";

export interface SettingsFormInitial {
  title: string;
  description: string;
  baseUrl: string;
  language: string;
  timezone: string;
  dateFormat: "long" | "medium" | "short" | "iso";
  authorName: string;
  authorEmail: string;
  homepage: "hero-recent" | "latest-posts" | "static-page";
  postsPerPage: number;
  staticPage: string;
  commentsEnabled: boolean;
  moderation: "auto" | "manual";
  closeAfterDays: number;
  maxDepth: number;
  perPage: number;
  defaultPostStatus: "published" | "draft";
  defaultPostCategory: string;
  permalinkStructure: "plain" | "month-and-name" | "day-and-name";
}

interface SettingsFormProps {
  /** Bound server action — updateSettingsAction. */
  action: (prev: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  /** Pre-filled values from current config/site.yaml. */
  initial: SettingsFormInitial;
  /** Show success banner when redirected with ?saved=1. */
  saved?: boolean;
  /** Pre-translated success message (from server). */
  savedMsg?: string;
  /** All existing categories — powers the default post category dropdown. */
  categories?: { slug: string; label: string }[];
}

/**
 * SettingsForm — client island for the admin settings screen.
 * Presentational only: owns form UX (pending state, field/global errors, success banner).
 * No data fetching, no auth, no FS imports.
 */
export function SettingsForm({ action, initial, saved, savedMsg, categories = [] }: SettingsFormProps) {
  const [state, dispatch] = useActionState<SettingsFormState, FormData>(action, undefined);
  const tr = useT();

  // Controlled homepage select for conditional static_page visibility
  const [homepage, setHomepage] = useState<string>(initial.homepage);

  const fieldErrors =
    state && "fieldErrors" in state ? state.fieldErrors : {};
  const globalError =
    state && "error" in state ? state.error : undefined;

  return (
    <form action={dispatch} noValidate className="max-w-4xl space-y-6">
      {/* Global error */}
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}

      {/* Success banner — shown when redirected with ?saved=1 */}
      {saved && (
        <FormAlert tone="success">{savedMsg ?? tr("admin.settings.saved")}</FormAlert>
      )}

      {/* ── General ── */}
      <FormSection
        title={tr("admin.settings.tabGeneral")}
        description={tr("admin.settings.descGeneral")}
      >
        <Field
          htmlFor="settings-title"
          label={tr("admin.settings.siteTitle")}
          required
          error={fieldErrors["title"]}
          layout="table"
        >
          <TextInput
            id="settings-title"
            type="text"
            name="title"
            required
            defaultValue={initial.title}
            aria-describedby={fieldErrors["title"] ? "settings-title-error" : undefined}
          />
        </Field>

        <Field
          htmlFor="settings-description"
          label={tr("admin.settings.tagline")}
          layout="table"
        >
          <Textarea
            id="settings-description"
            name="description"
            rows={2}
            defaultValue={initial.description}
          />
        </Field>

        <Field
          htmlFor="settings-baseUrl"
          label={tr("admin.settings.baseUrl")}
          required
          error={fieldErrors["baseUrl"]}
          layout="table"
        >
          <TextInput
            id="settings-baseUrl"
            type="url"
            name="baseUrl"
            required
            defaultValue={initial.baseUrl}
            aria-describedby={fieldErrors["baseUrl"] ? "settings-baseUrl-error" : undefined}
          />
        </Field>

        <Field
          htmlFor="settings-language"
          label={tr("admin.settings.language")}
          required
          error={fieldErrors["language"]}
          layout="table"
        >
          <SelectInput
            id="settings-language"
            name="language"
            required
            defaultValue={initial.language}
            aria-describedby={fieldErrors["language"] ? "settings-language-error" : undefined}
          >
            {localeOptions().map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.name}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field
          htmlFor="settings-timezone"
          label={tr("admin.settings.timezone")}
          layout="table"
        >
          <SelectInput
            id="settings-timezone"
            name="timezone"
            defaultValue={initial.timezone}
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="America/Chicago">America/Chicago</option>
            <option value="America/Denver">America/Denver</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Europe/Madrid">Europe/Madrid</option>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="Asia/Seoul">Asia/Seoul</option>
            <option value="Asia/Shanghai">Asia/Shanghai</option>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
            <option value="Asia/Dubai">Asia/Dubai</option>
            <option value="Australia/Sydney">Australia/Sydney</option>
            <option value="Pacific/Auckland">Pacific/Auckland</option>
          </SelectInput>
        </Field>

        <Field
          htmlFor="settings-dateFormat"
          label={tr("admin.settings.dateFormat")}
          layout="table"
        >
          <SelectInput
            id="settings-dateFormat"
            name="dateFormat"
            defaultValue={initial.dateFormat}
          >
            <option value="long">{tr("admin.settings.dateFormatLong")}</option>
            <option value="medium">{tr("admin.settings.dateFormatMedium")}</option>
            <option value="short">{tr("admin.settings.dateFormatShort")}</option>
            <option value="iso">{tr("admin.settings.dateFormatIso")}</option>
          </SelectInput>
        </Field>

        <Field
          htmlFor="settings-authorName"
          label={tr("admin.settings.authorName")}
          required
          error={fieldErrors["author.name"]}
          layout="table"
        >
          <TextInput
            id="settings-authorName"
            type="text"
            name="author.name"
            required
            defaultValue={initial.authorName}
            aria-describedby={fieldErrors["author.name"] ? "settings-authorName-error" : undefined}
          />
        </Field>

        <Field
          htmlFor="settings-authorEmail"
          label={tr("admin.settings.authorEmail")}
          error={fieldErrors["author.email"]}
          layout="table"
        >
          <TextInput
            id="settings-authorEmail"
            type="email"
            name="author.email"
            defaultValue={initial.authorEmail}
            aria-describedby={fieldErrors["author.email"] ? "settings-authorEmail-error" : undefined}
          />
        </Field>
      </FormSection>

      {/* ── Reading ── */}
      <FormSection
        title={tr("admin.settings.tabReading")}
        description={tr("admin.settings.descReading")}
      >
        <Field
          htmlFor="settings-homepage"
          label={tr("admin.settings.homepageDisplays")}
          layout="table"
        >
          <SelectInput
            id="settings-homepage"
            name="reading.homepage"
            defaultValue={initial.homepage}
            onChange={(e) => setHomepage(e.target.value)}
          >
            <option value="hero-recent">{tr("admin.settings.homepageHero")}</option>
            <option value="latest-posts">{tr("admin.settings.homepageLatest")}</option>
            <option value="static-page">{tr("admin.settings.homepageStatic")}</option>
          </SelectInput>
        </Field>

        {/* Conditional: only shown when homepage is static-page */}
        {homepage === "static-page" && (
          <Field
            htmlFor="settings-staticPage"
            label={tr("admin.settings.frontPage")}
            required
            error={fieldErrors["reading.static_page"]}
            layout="table"
          >
            <TextInput
              id="settings-staticPage"
              type="text"
              name="reading.static_page"
              defaultValue={initial.staticPage}
              aria-describedby={fieldErrors["reading.static_page"] ? "settings-staticPage-error" : undefined}
            />
          </Field>
        )}

        <Field
          htmlFor="settings-postsPerPage"
          label={tr("admin.settings.postsPerPage")}
          error={fieldErrors["reading.posts_per_page"]}
          layout="table"
        >
          <TextInput
            id="settings-postsPerPage"
            type="number"
            name="reading.posts_per_page"
            min={1}
            max={9999}
            defaultValue={initial.postsPerPage}
            aria-describedby={fieldErrors["reading.posts_per_page"] ? "settings-postsPerPage-error" : undefined}
          />
        </Field>
      </FormSection>

      {/* ── Discussion ── */}
      <FormSection
        title={tr("admin.settings.tabDiscussion")}
        description={tr("admin.settings.descDiscussion")}
      >
        <Field
          htmlFor="settings-commentsEnabled"
          label={tr("admin.settings.allowComments")}
          layout="table"
        >
          <input
            id="settings-commentsEnabled"
            type="checkbox"
            name="comments_enabled"
            value="on"
            defaultChecked={initial.commentsEnabled}
            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500"
          />
        </Field>

        <Field
          htmlFor="settings-moderation"
          label={tr("admin.settings.moderation")}
          layout="table"
        >
          <SelectInput
            id="settings-moderation"
            name="comments.moderation"
            defaultValue={initial.moderation}
          >
            <option value="manual">{tr("admin.settings.moderationManual")}</option>
            <option value="auto">{tr("admin.settings.moderationAuto")}</option>
          </SelectInput>
        </Field>

        <Field
          htmlFor="settings-closeAfterDays"
          label={tr("admin.settings.closeAfterDays")}
          hint={tr("admin.settings.closeAfterDaysHint")}
          layout="table"
        >
          <TextInput
            id="settings-closeAfterDays"
            type="number"
            name="comments.close_after_days"
            min={0}
            step={1}
            defaultValue={initial.closeAfterDays}
          />
        </Field>

        <Field
          htmlFor="settings-maxDepth"
          label={tr("admin.settings.maxDepth")}
          hint={tr("admin.settings.maxDepthHint")}
          layout="table"
        >
          <TextInput
            id="settings-maxDepth"
            type="number"
            name="comments.max_depth"
            min={0}
            step={1}
            defaultValue={initial.maxDepth}
          />
        </Field>

        <Field
          htmlFor="settings-perPage"
          label={tr("admin.settings.commentsPerPage")}
          hint={tr("admin.settings.commentsPerPageHint")}
          layout="table"
        >
          <TextInput
            id="settings-perPage"
            type="number"
            name="comments.per_page"
            min={0}
            step={1}
            defaultValue={initial.perPage}
          />
        </Field>
      </FormSection>

      {/* ── Writing ── */}
      <FormSection
        title={tr("admin.settings.tabWriting")}
        description={tr("admin.settings.descWriting")}
      >
        <Field
          htmlFor="settings-defaultPostStatus"
          label={tr("admin.settings.defaultPostStatus")}
          layout="table"
        >
          <SelectInput
            id="settings-defaultPostStatus"
            name="writing.default_post_status"
            defaultValue={initial.defaultPostStatus}
          >
            <option value="draft">{tr("admin.status.draft")}</option>
            <option value="published">{tr("admin.status.published")}</option>
          </SelectInput>
        </Field>

        <Field
          htmlFor="settings-defaultPostCategory"
          label={tr("admin.settings.defaultPostCategory")}
          layout="table"
        >
          <SelectInput
            id="settings-defaultPostCategory"
            name="writing.default_post_category"
            defaultValue={initial.defaultPostCategory}
          >
            <option value="">{tr("admin.settings.uncategorized")}</option>
            {/* If the current value isn't in the list, prepend it so it isn't lost */}
            {initial.defaultPostCategory !== "" &&
              !categories.some(
                (c) =>
                  c.label.toLowerCase() ===
                  initial.defaultPostCategory.toLowerCase()
              ) && (
                <option value={initial.defaultPostCategory}>
                  {initial.defaultPostCategory}
                </option>
              )}
            {categories.map((c) => (
              <option key={c.slug} value={c.label}>
                {c.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      </FormSection>

      {/* ── Permalinks ── */}
      <FormSection
        title={tr("admin.settings.tabPermalinks")}
        description={tr("admin.settings.permalinkHelp")}
      >
        <Field
          htmlFor="settings-permalink-plain"
          label={tr("admin.settings.permalinkStructure")}
          layout="table"
        >
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="settings-permalink-plain"
                type="radio"
                name="permalinks.structure"
                value="plain"
                defaultChecked={initial.permalinkStructure === "plain"}
                className="h-4 w-4 border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500"
              />
              <span className="flex flex-col">
                <span>{tr("admin.settings.permalinkPlain")}</span>
                <span className="text-xs text-zinc-500 font-mono">/blog/sample-post</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="settings-permalink-month"
                type="radio"
                name="permalinks.structure"
                value="month-and-name"
                defaultChecked={initial.permalinkStructure === "month-and-name"}
                className="h-4 w-4 border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500"
              />
              <span className="flex flex-col">
                <span>{tr("admin.settings.permalinkMonth")}</span>
                <span className="text-xs text-zinc-500 font-mono">/blog/2026/06/sample-post</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="settings-permalink-day"
                type="radio"
                name="permalinks.structure"
                value="day-and-name"
                defaultChecked={initial.permalinkStructure === "day-and-name"}
                className="h-4 w-4 border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500"
              />
              <span className="flex flex-col">
                <span>{tr("admin.settings.permalinkDay")}</span>
                <span className="text-xs text-zinc-500 font-mono">/blog/2026/06/22/sample-post</span>
              </span>
            </label>
          </div>
        </Field>
      </FormSection>

      <FormActions>
        <SubmitButton variant="accent" label={tr("admin.settings.saveSettings")} pendingLabel={tr("admin.common.saving")} />
      </FormActions>
    </form>
  );
}
