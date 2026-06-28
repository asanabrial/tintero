"use client";

import { Fragment, useActionState, useRef, useState } from "react";
import type { NavActionState } from "./actions";
import { SubmitButton } from "@/app/components/ui/submit-button";
import type { NavItem } from "@/lib/content/schema";
import { useT } from "@/lib/i18n/provider";
import {
  moveItem,
  moveItemUp,
  moveItemDown,
  nestItem,
  outdentItem,
  addItems,
  removeTopItem,
  removeChildItem,
  updateItemLabel,
  updateChildLabel,
} from "./menu-tree";

// ============================================================
// PickerItem type — exported so page.tsx can import it
// ============================================================

export interface PickerItem {
  label: string;
  href: string;
}

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
// PagesPanel
// ============================================================

interface PagesPanelProps {
  pickerPages: PickerItem[];
  onAdd: (items: PickerItem[]) => void;
}

function PagesPanel({ pickerPages, onAdd }: PagesPanelProps) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (pickerPages.length === 0) return null;

  function toggle(href: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function handleAdd() {
    const items = pickerPages.filter((p) => selected.has(p.href));
    if (items.length === 0) return;
    onAdd(items);
    setSelected(new Set());
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{tr("admin.menus.pagesSection")}</p>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {pickerPages.map((p) => {
          const id = `picker-page-${p.href}`;
          return (
            <li key={p.href}>
              <label htmlFor={id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  id={id}
                  type="checkbox"
                  checked={selected.has(p.href)}
                  onChange={() => toggle(p.href)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                {p.label}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={handleAdd}
        disabled={selected.size === 0}
        className={btnBase}
      >
        {tr("admin.menus.addToMenu")}
      </button>
    </div>
  );
}

// ============================================================
// CategoriesPanel
// ============================================================

interface CategoriesPanelProps {
  pickerCategories: PickerItem[];
  onAdd: (items: PickerItem[]) => void;
}

function CategoriesPanel({ pickerCategories, onAdd }: CategoriesPanelProps) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (pickerCategories.length === 0) return null;

  function toggle(href: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function handleAdd() {
    const items = pickerCategories.filter((c) => selected.has(c.href));
    if (items.length === 0) return;
    onAdd(items);
    setSelected(new Set());
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{tr("admin.menus.categoriesSection")}</p>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {pickerCategories.map((c) => {
          const id = `picker-cat-${c.href}`;
          return (
            <li key={c.href}>
              <label htmlFor={id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                <input
                  id={id}
                  type="checkbox"
                  checked={selected.has(c.href)}
                  onChange={() => toggle(c.href)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                {c.label}
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={handleAdd}
        disabled={selected.size === 0}
        className={btnBase}
      >
        {tr("admin.menus.addToMenu")}
      </button>
    </div>
  );
}

// ============================================================
// CustomLinkPanel
// ============================================================

interface CustomLinkPanelProps {
  onAdd: (items: PickerItem[]) => void;
}

function CustomLinkPanel({ onAdd }: CustomLinkPanelProps) {
  const tr = useT();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  function handleAdd() {
    const href = url.trim();
    const label = text.trim();
    if (!href || !label) return;
    onAdd([{ label, href }]);
    setUrl("");
    setText("");
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{tr("admin.menus.customLink")}</p>
      <div className="space-y-2">
        <div>
          <label htmlFor="custom-link-url" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            {tr("admin.menus.customLinkUrl")}
          </label>
          <input
            id="custom-link-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tr("admin.menus.customLinkUrlPlaceholder")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="custom-link-text" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            {tr("admin.menus.customLinkText")}
          </label>
          <input
            id="custom-link-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr("admin.menus.customLinkTextPlaceholder")}
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!url.trim() || !text.trim()}
        className={btnBase}
      >
        {tr("admin.menus.addToMenu")}
      </button>
    </div>
  );
}

// ============================================================
// ChildCard
// ============================================================

interface ChildCardProps {
  child: { label: string; href: string };
  parentIndex: number;
  childIndex: number;
  totalChildren: number;
  labelError?: string;
  hrefError?: string;
  onLabelChange: (value: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOutdent: () => void;
  onRemove: () => void;
}

function ChildCard({
  child,
  parentIndex,
  childIndex,
  totalChildren,
  labelError,
  hrefError,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  onOutdent,
  onRemove,
}: ChildCardProps) {
  const tr = useT();
  const labelId = `nav-${parentIndex}-child-label-${childIndex}`;
  const labelErrorId = `nav-${parentIndex}-child-label-error-${childIndex}`;
  const hrefErrorId = `nav-${parentIndex}-child-href-error-${childIndex}`;

  return (
    <div className="ml-6 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 flex gap-3 items-start">
      <div className="flex-1 space-y-2">
        <div className="space-y-1">
          <label htmlFor={labelId} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {tr("admin.menus.labelField")}
          </label>
          <input
            id={labelId}
            type="text"
            value={child.label}
            onChange={(e) => onLabelChange(e.target.value)}
            aria-describedby={labelError ? labelErrorId : undefined}
            className={inputClass}
          />
          {labelError && (
            <span id={labelErrorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
              {labelError}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate" aria-label="URL">
          {child.href}
        </p>
        {hrefError && (
          <span id={hrefErrorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {hrefError}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          aria-label={`Move submenu item '${child.label}' up`}
          disabled={childIndex === 0}
          className={btnBase}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          aria-label={`Move submenu item '${child.label}' down`}
          disabled={childIndex === totalChildren - 1}
          className={btnBase}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onOutdent}
          aria-label={`Outdent submenu item '${child.label}'`}
          className={btnBase}
        >
          {tr("admin.menus.outdentItem")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove submenu item '${child.label}'`}
          className={btnDanger}
        >
          {tr("admin.common.remove")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MenuItemCard (top-level item)
// ============================================================

interface MenuItemCardProps {
  item: NavItem;
  index: number;
  total: number;
  isDragOver: boolean;
  labelError?: string;
  hrefError?: string;
  childErrors?: Record<number, { label?: string; href?: string }>;
  onLabelChange: (value: string) => void;
  onChildLabelChange: (childIndex: number, value: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onNest: () => void;
  onOutdentChild: (childIndex: number) => void;
  onRemove: () => void;
  onRemoveChild: (childIndex: number) => void;
  onMoveChildUp: (childIndex: number) => void;
  onMoveChildDown: (childIndex: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function MenuItemCard({
  item,
  index,
  total,
  isDragOver,
  labelError,
  hrefError,
  childErrors,
  onLabelChange,
  onChildLabelChange,
  onMoveUp,
  onMoveDown,
  onNest,
  onOutdentChild,
  onRemove,
  onRemoveChild,
  onMoveChildUp,
  onMoveChildDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: MenuItemCardProps) {
  const tr = useT();
  const labelId = `nav-label-${index}`;
  const labelErrorId = `nav-label-error-${index}`;
  const hrefErrorId = `nav-href-error-${index}`;

  const canNest = index > 0 && !(item.children && item.children.length > 0);
  const hasChildren = (item.children?.length ?? 0) > 0;

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
        aria-label={tr("admin.menus.dragToReorder")}
        className="cursor-grab active:cursor-grabbing pt-1 text-zinc-400 dark:text-zinc-600 select-none shrink-0"
      >
        ⠿
      </div>

      {/* Content */}
      <div className="flex-1 space-y-2 min-w-0">
        {/* Label */}
        <div className="space-y-1">
          <label htmlFor={labelId} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {tr("admin.menus.labelField")}
          </label>
          <input
            id={labelId}
            type="text"
            value={item.label}
            onChange={(e) => onLabelChange(e.target.value)}
            aria-describedby={labelError ? labelErrorId : undefined}
            className={inputClass}
          />
          {labelError && (
            <span id={labelErrorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
              {labelError}
            </span>
          )}
        </div>

        {/* Href (read-only hint) */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate" aria-label="URL">
          {item.href}
        </p>
        {hrefError && (
          <span id={hrefErrorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
            {hrefError}
          </span>
        )}

        {/* Children */}
        {hasChildren && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{tr("admin.menus.submenuItems")}</p>
            {item.children!.map((child, childIndex) => (
              <ChildCard
                key={childIndex}
                child={child}
                parentIndex={index}
                childIndex={childIndex}
                totalChildren={item.children!.length}
                labelError={childErrors?.[childIndex]?.label}
                hrefError={childErrors?.[childIndex]?.href}
                onLabelChange={(val) => onChildLabelChange(childIndex, val)}
                onMoveUp={() => onMoveChildUp(childIndex)}
                onMoveDown={() => onMoveChildDown(childIndex)}
                onOutdent={() => onOutdentChild(childIndex)}
                onRemove={() => onRemoveChild(childIndex)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          aria-label={`Move '${item.label}' up`}
          disabled={index === 0}
          className={btnBase}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          aria-label={`Move '${item.label}' down`}
          disabled={index === total - 1}
          className={btnBase}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onNest}
          aria-label={`Indent '${item.label}' under previous item`}
          disabled={!canNest}
          title={
            hasChildren
              ? tr("admin.menus.cannotIndentHasChildren")
              : index === 0
              ? tr("admin.menus.cannotIndentFirst")
              : undefined
          }
          className={btnBase}
        >
          {tr("admin.menus.indentItem")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove '${item.label}'`}
          className={btnDanger}
        >
          {tr("admin.common.remove")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MenuEditorProps
// ============================================================

interface MenuEditorProps {
  initial: NavItem[];
  saved: boolean;
  action: (prev: NavActionState, formData: FormData) => Promise<NavActionState>;
  pickerPages?: PickerItem[];
  pickerCategories?: PickerItem[];
}

// ============================================================
// MenuEditor island
// ============================================================

/**
 * MenuEditor — client island for the admin nav editor screen.
 * Manages tree state locally; persists via a hidden-input form + server action.
 * No data fetching, no auth, no FS imports.
 */
export function MenuEditor({
  initial,
  saved,
  action,
  pickerPages = [],
  pickerCategories = [],
}: MenuEditorProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<NavActionState, FormData>(action, undefined);
  const [tree, setTree] = useState<NavItem[]>(initial);

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
  // Tree mutation handlers
  // ──────────────────────────────────────────────

  function handleAddItems(items: PickerItem[]) {
    setTree((t) => addItems(t, items));
  }

  function handleMoveUp(index: number) {
    setTree((t) => moveItemUp(t, index));
  }

  function handleMoveDown(index: number) {
    setTree((t) => moveItemDown(t, index));
  }

  function handleNest(index: number) {
    setTree((t) => nestItem(t, index));
  }

  function handleOutdentChild(parentIndex: number, childIndex: number) {
    setTree((t) => outdentItem(t, parentIndex, childIndex));
  }

  function handleRemove(index: number) {
    setTree((t) => removeTopItem(t, index));
  }

  function handleRemoveChild(parentIndex: number, childIndex: number) {
    setTree((t) => removeChildItem(t, parentIndex, childIndex));
  }

  function handleLabelChange(index: number, label: string) {
    setTree((t) => updateItemLabel(t, index, label));
  }

  function handleChildLabelChange(parentIndex: number, childIndex: number, label: string) {
    setTree((t) => updateChildLabel(t, parentIndex, childIndex, label));
  }

  function handleMoveChildUp(parentIndex: number, childIndex: number) {
    setTree((t) => {
      const item = t[parentIndex];
      if (!item?.children) return t;
      const newChildren = [...item.children];
      if (childIndex <= 0) return t;
      [newChildren[childIndex - 1], newChildren[childIndex]] = [
        newChildren[childIndex],
        newChildren[childIndex - 1],
      ];
      return t.map((it, i) => (i === parentIndex ? { ...it, children: newChildren } : it));
    });
  }

  function handleMoveChildDown(parentIndex: number, childIndex: number) {
    setTree((t) => {
      const item = t[parentIndex];
      if (!item?.children) return t;
      const newChildren = [...item.children];
      if (childIndex >= newChildren.length - 1) return t;
      [newChildren[childIndex], newChildren[childIndex + 1]] = [
        newChildren[childIndex + 1],
        newChildren[childIndex],
      ];
      return t.map((it, i) => (i === parentIndex ? { ...it, children: newChildren } : it));
    });
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
      setTree((t) => moveItem(t, dragIndex.current!, index));
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
      {/* ── Left panel: Add-to-menu panels ── */}
      <aside className="w-full lg:w-72 space-y-4 shrink-0">
        <PagesPanel pickerPages={pickerPages} onAdd={handleAddItems} />
        <CategoriesPanel pickerCategories={pickerCategories} onAdd={handleAddItems} />
        <CustomLinkPanel onAdd={handleAddItems} />
      </aside>

      {/* ── Right panel: Menu Structure ── */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Success banner */}
        {saved && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2"
          >
            <p className="text-sm text-green-700 dark:text-green-400">
              {tr("admin.menus.navigationSaved")}
            </p>
          </div>
        )}

        {/* Global error banner */}
        {globalError && (
          <div
            role="alert"
            className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2"
          >
            <p className="text-sm text-red-700 dark:text-red-400">{tr(globalError)}</p>
          </div>
        )}

        {/* Validation error summary */}
        {itemErrors && Object.keys(itemErrors).length > 0 && (
          <div
            role="alert"
            className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 space-y-1"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {tr("admin.menus.fixErrors")}
            </p>
            <ul className="list-disc list-inside text-xs text-red-600 dark:text-red-400 space-y-0.5">
              {Object.entries(itemErrors).map(([i, errs]) => {
                const idx = parseInt(i, 10);
                const itemLabel = tree[idx]?.label || `Item ${idx + 1}`;
                const msgs: string[] = [];
                if (errs.label) msgs.push(`label: ${errs.label}`);
                if (errs.href) msgs.push(`URL: ${errs.href}`);
                if (errs.childErrors) {
                  Object.entries(errs.childErrors).forEach(([j, cerr]) => {
                    const childLabel = tree[idx]?.children?.[parseInt(j, 10)]?.label || `child ${parseInt(j, 10) + 1}`;
                    if (cerr.label) msgs.push(`"${childLabel}" label: ${cerr.label}`);
                    if (cerr.href) msgs.push(`"${childLabel}" URL: ${cerr.href}`);
                  });
                }
                return msgs.map((msg, k) => (
                  <li key={`${i}-${k}`}>
                    <strong>{itemLabel}</strong>: {msg}
                  </li>
                ));
              })}
            </ul>
          </div>
        )}

        {/* Form with hidden inputs + save button */}
        <form action={dispatch} className="space-y-3">
          {/* Hidden FormData encoding */}
          <input type="hidden" name="nav_count" value={tree.length} />
          {tree.map((item, i) => (
            <Fragment key={i}>
              <input type="hidden" name={`nav[${i}][label]`} value={item.label} />
              <input type="hidden" name={`nav[${i}][href]`} value={item.href} />
              <input
                type="hidden"
                name={`nav[${i}][children_count]`}
                value={item.children?.length ?? 0}
              />
              {item.children?.map((child, j) => (
                <Fragment key={j}>
                  <input
                    type="hidden"
                    name={`nav[${i}][children][${j}][label]`}
                    value={child.label}
                  />
                  <input
                    type="hidden"
                    name={`nav[${i}][children][${j}][href]`}
                    value={child.href}
                  />
                </Fragment>
              ))}
            </Fragment>
          ))}

          {/* Empty state */}
          {tree.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {tr("admin.menus.noMenuItems")}
            </p>
          )}

          {/* Item cards */}
          {tree.map((item, i) => (
            <MenuItemCard
              key={i}
              item={item}
              index={i}
              total={tree.length}
              isDragOver={dropTargetIndex === i}
              labelError={itemErrors?.[i]?.label}
              hrefError={itemErrors?.[i]?.href}
              childErrors={itemErrors?.[i]?.childErrors}
              onLabelChange={(val) => handleLabelChange(i, val)}
              onChildLabelChange={(childIndex, val) =>
                handleChildLabelChange(i, childIndex, val)
              }
              onMoveUp={() => handleMoveUp(i)}
              onMoveDown={() => handleMoveDown(i)}
              onNest={() => handleNest(i)}
              onOutdentChild={(childIndex) => handleOutdentChild(i, childIndex)}
              onRemove={() => handleRemove(i)}
              onRemoveChild={(childIndex) => handleRemoveChild(i, childIndex)}
              onMoveChildUp={(childIndex) => handleMoveChildUp(i, childIndex)}
              onMoveChildDown={(childIndex) => handleMoveChildDown(i, childIndex)}
              onDragStart={(e) => handleDragStart(i, e)}
              onDragOver={(e) => handleDragOver(i, e)}
              onDrop={(e) => handleDrop(i, e)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* Save */}
          <SubmitButton label={tr("admin.menus.saveNavigation")} pendingLabel={tr("admin.common.saving")} name="_intent" value="save" />
        </form>
      </div>
    </div>
  );
}
