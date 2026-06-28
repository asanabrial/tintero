"use client";

import { useActionState } from "react";
import type { WxrImportActionState } from "./actions";
import { useT } from "@/lib/i18n/provider";
import { SubmitButton } from "@/app/components/ui/submit-button";

// ============================================================
// WxrImportForm — client island for the WordPress WXR import section
// ============================================================

interface WxrImportFormProps {
  action: (
    prev: WxrImportActionState,
    fd: FormData
  ) => Promise<WxrImportActionState>;
}

export function WxrImportForm({ action }: WxrImportFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<WxrImportActionState, FormData>(
    action,
    undefined
  );

  return (
    <div className="space-y-4">
      <form action={dispatch} className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="wxr-file"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {tr("admin.tools.wxrFile")} <span aria-hidden="true">*</span>
          </label>
          <input
            id="wxr-file"
            type="file"
            name="wxr-file"
            accept=".xml,application/xml,text/xml"
            required
            className="block w-full text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900 dark:file:text-zinc-50 hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="wxr-mode"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {tr("admin.tools.collisionMode")}
          </label>
          <select
            id="wxr-mode"
            name="mode"
            defaultValue="skip"
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-colors"
          >
            <option value="skip">{tr("admin.tools.skipExisting")}</option>
            <option value="overwrite">{tr("admin.tools.overwriteExisting")}</option>
          </select>
        </div>

        <SubmitButton label={tr("admin.tools.importWxr")} pendingLabel={tr("admin.tools.importing")} />
      </form>

      {/* Error state */}
      {state && "error" in state && (
        <div
          role="alert"
          className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2"
        >
          <p className="text-sm text-red-700 dark:text-red-400">{tr(state.error)}</p>
        </div>
      )}

      {/* Success state — import report */}
      {state && "ok" in state && state.ok && (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2"
          >
            <p className="text-sm text-green-700 dark:text-green-400">
              {tr("admin.tools.importComplete", { imported: state.report.imported.length, skipped: state.report.skipped.length, failed: state.report.failed.length })}
            </p>
          </div>

          {state.report.imported.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                {tr("admin.tools.importedHeading", { count: state.report.imported.length })}
              </h3>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-0.5">
                {state.report.imported.map((slug) => (
                  <li key={slug} className="font-mono">
                    {slug}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.report.skipped.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                {tr("admin.tools.skippedHeading", { count: state.report.skipped.length })}
              </h3>
              <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-0.5">
                {state.report.skipped.map((slug) => (
                  <li key={slug} className="font-mono">
                    {slug}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.report.failed.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                {tr("admin.tools.failedHeading", { count: state.report.failed.length })}
              </h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="pb-1 pr-4 font-medium">{tr("admin.tools.colSlug")}</th>
                    <th className="pb-1 font-medium">{tr("admin.tools.colError")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.report.failed.map(({ slug, error }) => (
                    <tr
                      key={slug}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-4 font-mono text-zinc-700 dark:text-zinc-300">
                        {slug}
                      </td>
                      <td className="py-1 text-red-600 dark:text-red-400">
                        {error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Warnings from parseWxr (skipped post types, dropped fields, etc.) */}
          {state.warnings.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2"
            >
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                {tr("admin.tools.warningsHeading", { count: state.warnings.length })}
              </h3>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-0.5">
                {state.warnings.map((warning, i) => (
                  // Using index as key is acceptable here — warnings are immutable after render
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("admin.tools.wxrImageNote")}
          </p>
        </div>
      )}
    </div>
  );
}
