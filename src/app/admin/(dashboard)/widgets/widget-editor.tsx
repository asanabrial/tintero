"use client";

import { Fragment, useActionState, useRef, useState } from "react";
import type { WidgetActionState } from "./actions";
import { SubmitButton } from "@/app/components/ui/submit-button";
import type { Widget } from "@/lib/widgets/types";
import { useT } from "@/lib/i18n/provider";
import {
  addWidget,
  removeWidget,
  moveWidgetUp,
  moveWidgetDown,
  moveWidget,
  updateWidget,
} from "./widget-list";

// ============================================================
// Tailwind class shorthands
// ============================================================

const btnBase =
  "inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const btnDanger =
  "inline-flex items-center rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors";

const inputClass =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-colors";

// ============================================================
// Widget palette metadata
// ============================================================

const PALETTE_CONFIG: {
  type: Widget["type"];
  labelKey: string;
  descKey: string;
}[] = [
  { type: "recent-posts", labelKey: "admin.widgets.paletteRecentPosts", descKey: "admin.widgets.recentPostsDesc" },
  { type: "categories", labelKey: "admin.widgets.paletteCategories", descKey: "admin.widgets.categoriesDesc" },
  { type: "tag-cloud", labelKey: "admin.widgets.paletteTagCloud", descKey: "admin.widgets.tagCloudDesc" },
  { type: "search", labelKey: "admin.widgets.paletteSearch", descKey: "admin.widgets.searchDesc" },
  { type: "custom-html", labelKey: "admin.widgets.paletteCustomHtml", descKey: "admin.widgets.customHtmlDesc" },
];

// ============================================================
// WidgetCard
// ============================================================

interface WidgetCardProps {
  widget: Widget;
  index: number;
  total: number;
  isDragOver: boolean;
  error?: string;
  onUpdate: (patch: Partial<Widget>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function WidgetCard({
  widget,
  index,
  total,
  isDragOver,
  error,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: WidgetCardProps) {
  const tr = useT();
  const titleId = `widget-title-${index}`;
  const countId = `widget-count-${index}`;
  const htmlId = `widget-html-${index}`;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={[
        "rounded-lg border bg-white dark:bg-zinc-900 p-4 flex gap-4 items-start transition-colors",
        isDragOver
          ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-300 dark:ring-blue-600"
          : "border-zinc-200 dark:border-zinc-800",
      ].join(" ")}
    >
      {/* Drag handle */}
      <div
        aria-label={tr("admin.widgets.dragToReorder")}
        className="cursor-grab active:cursor-grabbing pt-1 text-zinc-400 dark:text-zinc-600 select-none shrink-0"
      >
        ⠿
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 min-w-0">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {widget.type}
          </span>
        </div>

        {/* Title (all types) */}
        <div className="space-y-1">
          <label
            htmlFor={titleId}
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {tr("admin.widgets.fieldTitle")}
          </label>
          <input
            id={titleId}
            type="text"
            value={widget.title ?? ""}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={tr("admin.widgets.titlePlaceholder")}
            className={inputClass}
          />
        </div>

        {/* Count (recent-posts only) */}
        {widget.type === "recent-posts" && (
          <div className="space-y-1">
            <label
              htmlFor={countId}
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {tr("admin.widgets.fieldCount")}
            </label>
            <input
              id={countId}
              type="number"
              min={1}
              max={20}
              value={widget.count ?? 5}
              onChange={(e) =>
                onUpdate({ count: parseInt(e.target.value, 10) || 1 })
              }
              className="block w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-colors"
            />
          </div>
        )}

        {/* HTML (custom-html only) */}
        {widget.type === "custom-html" && (
          <div className="space-y-1">
            <label
              htmlFor={htmlId}
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {tr("admin.widgets.fieldHtml")}
            </label>
            <textarea
              id={htmlId}
              rows={4}
              value={widget.html ?? ""}
              onChange={(e) => onUpdate({ html: e.target.value })}
              placeholder={tr("admin.widgets.htmlPlaceholder")}
              className={`${inputClass} font-mono`}
            />
          </div>
        )}

        {error && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          aria-label={`Move widget '${widget.title || widget.type}' up`}
          disabled={index === 0}
          className={btnBase}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          aria-label={`Move widget '${widget.title || widget.type}' down`}
          disabled={index === total - 1}
          className={btnBase}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove widget '${widget.title || widget.type}'`}
          className={btnDanger}
        >
          {tr("admin.common.remove")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// WidgetEditorProps
// ============================================================

interface WidgetEditorProps {
  initial: Widget[];
  saved: boolean;
  action: (prev: WidgetActionState, formData: FormData) => Promise<WidgetActionState>;
}

// ============================================================
// WidgetEditor island
// ============================================================

export function WidgetEditor({ initial, saved, action }: WidgetEditorProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<WidgetActionState, FormData>(
    action,
    undefined
  );
  const [widgets, setWidgets] = useState<Widget[]>(initial);

  // DnD state
  const dragIndex = useRef<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // ──────────────────────────────────────────────
  // Error extraction
  // ──────────────────────────────────────────────

  const itemErrors =
    state && !state.ok && "itemErrors" in state ? state.itemErrors : undefined;
  const globalError =
    state && !state.ok && "error" in state ? state.error : undefined;

  // ──────────────────────────────────────────────
  // Widget mutation handlers
  // ──────────────────────────────────────────────

  function handleAdd(type: Widget["type"]) {
    setWidgets((w) => addWidget(w, type));
  }

  function handleRemove(i: number) {
    setWidgets((w) => removeWidget(w, i));
  }

  function handleMoveUp(i: number) {
    setWidgets((w) => moveWidgetUp(w, i));
  }

  function handleMoveDown(i: number) {
    setWidgets((w) => moveWidgetDown(w, i));
  }

  function handleUpdate(i: number, patch: Partial<Widget>) {
    setWidgets((w) => updateWidget(w, i, patch));
  }

  // ──────────────────────────────────────────────
  // DnD handlers
  // ──────────────────────────────────────────────

  function handleDragStart(index: number, e: React.DragEvent) {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(index: number, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  }

  function handleDrop(index: number, e: React.DragEvent) {
    e.preventDefault();
    if (dragIndex.current !== null && dragIndex.current !== index) {
      setWidgets((w) => moveWidget(w, dragIndex.current!, index));
    }
    dragIndex.current = null;
    setDropTargetIndex(null);
  }

  function handleDragEnd(_e: React.DragEvent) {
    dragIndex.current = null;
    setDropTargetIndex(null);
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {/* ── Left column: Widget Palette ── */}
      <aside className="w-full lg:w-72 space-y-4 shrink-0">
        {PALETTE_CONFIG.map((entry) => (
          <div
            key={entry.type}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2"
          >
            <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50">
              {tr(entry.labelKey)}
            </p>
            <p className="text-xs text-zinc-500">{tr(entry.descKey)}</p>
            <button
              type="button"
              onClick={() => handleAdd(entry.type)}
              className={btnBase}
            >
              {tr("admin.common.add")}
            </button>
          </div>
        ))}
      </aside>

      {/* ── Right column: Blog Sidebar ── */}
      <div className="flex-1 space-y-4 min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {tr("admin.widgets.blogSidebar")}
        </h2>

        {/* Success banner */}
        {saved && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2"
          >
            <p className="text-sm text-green-700 dark:text-green-400">
              {tr("admin.widgets.widgetsSaved")}
            </p>
          </div>
        )}

        {/* Global error banner */}
        {globalError && (
          <div
            role="alert"
            className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2"
          >
            <p className="text-sm text-red-700 dark:text-red-400">{globalError}</p>
          </div>
        )}

        {/* Form with hidden inputs + widget cards + save button */}
        <form action={dispatch} className="space-y-3">
          {/* Hidden FormData encoding — must match reconstructWidgets in actions.ts exactly */}
          <input type="hidden" name="widget_count" value={widgets.length} />
          {widgets.map((w, i) => (
            <Fragment key={i}>
              <input type="hidden" name={`widget[${i}][type]`} value={w.type} />
              <input type="hidden" name={`widget[${i}][title]`} value={w.title ?? ""} />
              {w.type === "recent-posts" && (
                <input
                  type="hidden"
                  name={`widget[${i}][count]`}
                  value={w.count ?? 5}
                />
              )}
              {w.type === "custom-html" && (
                <input
                  type="hidden"
                  name={`widget[${i}][html]`}
                  value={w.html ?? ""}
                />
              )}
            </Fragment>
          ))}

          {/* Empty state */}
          {widgets.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {tr("admin.widgets.noWidgets")}
            </p>
          )}

          {/* Widget cards */}
          {widgets.map((w, i) => (
            <WidgetCard
              key={i}
              widget={w}
              index={i}
              total={widgets.length}
              isDragOver={dropTargetIndex === i}
              error={itemErrors?.[i]}
              onUpdate={(patch) => handleUpdate(i, patch)}
              onMoveUp={() => handleMoveUp(i)}
              onMoveDown={() => handleMoveDown(i)}
              onRemove={() => handleRemove(i)}
              onDragStart={(e) => handleDragStart(i, e)}
              onDragOver={(e) => handleDragOver(i, e)}
              onDrop={(e) => handleDrop(i, e)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Save */}
          <SubmitButton label={tr("admin.widgets.saveWidgets")} pendingLabel={tr("admin.common.saving")} name="_intent" value="save" />
        </form>
      </div>
    </div>
  );
}
