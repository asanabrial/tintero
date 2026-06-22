"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn, controlClass } from "@/app/components/ui/form";
import { useT } from "@/lib/i18n/provider";

/**
 * WordPress-style taxonomy controls for the post editor.
 *
 * Both controls keep the existing server-action contract intact: the action
 * reads a SINGLE comma-separated `categories` / `tags` field via
 * `formData.get()`, so each control serializes its selection into one hidden
 * input. The visible UI is richer (checklist / token chips) but the wire format
 * is unchanged.
 */

export interface TaxonomyOption {
  slug: string;
  label: string;
  count: number;
  depth?: number;
}

function dedupeKey(s: string): string {
  return s.trim().toLowerCase();
}

// ───────────────────────────── Category checklist ─────────────────────────────

/**
 * A checkbox list of existing categories (WordPress's category meta box) plus
 * an "Add new" field for ad-hoc categories. Selected labels are serialized into
 * a single hidden input named `name` (comma-joined).
 */
export function CategoryChecklist({
  name,
  options,
  initialSelected,
}: {
  name: string;
  options: TaxonomyOption[];
  initialSelected: string[];
}) {
  const tr = useT();

  // Canonical token is the category LABEL (what authors type and what the
  // frontmatter stores). Match initial values against label OR slug so existing
  // posts keep their selection regardless of which form was stored.
  const optionByKey = useMemo(() => {
    const m = new Map<string, TaxonomyOption>();
    for (const o of options) {
      m.set(dedupeKey(o.label), o);
      m.set(dedupeKey(o.slug), o);
    }
    return m;
  }, [options]);

  // Merge in any selected value that isn't a known category, so nothing is lost.
  const [extraOptions, setExtraOptions] = useState<TaxonomyOption[]>(() => {
    const extras: TaxonomyOption[] = [];
    const seen = new Set(options.flatMap((o) => [dedupeKey(o.label), dedupeKey(o.slug)]));
    for (const v of initialSelected) {
      const k = dedupeKey(v);
      if (k && !seen.has(k)) {
        extras.push({ slug: k, label: v.trim(), count: 0, depth: 0 });
        seen.add(k);
      }
    }
    return extras;
  });

  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const v of initialSelected) {
      const opt = optionByKey.get(dedupeKey(v));
      s.add(dedupeKey(opt ? opt.label : v));
    }
    return s;
  });

  const allOptions = useMemo(
    () => [...options, ...extraOptions],
    [options, extraOptions]
  );

  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of allOptions) m.set(dedupeKey(o.label), o.label);
    return m;
  }, [allOptions]);

  const serialized = useMemo(
    () =>
      [...selected]
        .map((k) => labelByKey.get(k) ?? k)
        .join(", "),
    [selected, labelByKey]
  );

  const toggle = (label: string) => {
    const k = dedupeKey(label);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const [newCat, setNewCat] = useState("");
  const addNew = () => {
    const value = newCat.trim();
    if (!value) return;
    const k = dedupeKey(value);
    if (!labelByKey.has(k) && !optionByKey.has(k)) {
      setExtraOptions((prev) => [...prev, { slug: k, label: value, count: 0, depth: 0 }]);
    }
    setSelected((prev) => new Set(prev).add(k));
    setNewCat("");
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={serialized} />
      <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
        {allOptions.length === 0 ? (
          <li className="px-1 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {tr("admin.editor.noCategoriesYet")}
          </li>
        ) : (
          allOptions.map((o) => {
            const k = dedupeKey(o.label);
            return (
              <li key={o.slug} style={{ paddingLeft: `${(o.depth ?? 0) * 14}px` }}>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={selected.has(k)}
                    onChange={() => toggle(o.label)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                  />
                  <span className="truncate">{o.label}</span>
                  {o.count > 0 ? (
                    <span className="ml-auto text-xs text-zinc-400">{o.count}</span>
                  ) : null}
                </label>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addNew();
            }
          }}
          placeholder={tr("admin.editor.addNewCategory")}
          className={cn(controlClass, "py-1.5 text-xs")}
        />
        <button
          type="button"
          onClick={addNew}
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {tr("admin.common.add")}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Tag token input ─────────────────────────────

/**
 * A token (chip) input for tags — type and press Enter/comma to add, click ×
 * to remove, with autocomplete from existing tags and a "Most used" shortcut
 * row. Serializes to a single hidden input named `name` (comma-joined).
 */
export function TagTokenInput({
  name,
  options,
  initialTokens,
}: {
  name: string;
  options: TaxonomyOption[];
  initialTokens: string[];
}) {
  const tr = useT();
  const [tokens, setTokens] = useState<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of initialTokens) {
      const v = t.trim();
      const k = dedupeKey(v);
      if (v && !seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    }
    return out;
  });
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // useId keeps the datalist id unique even if two token inputs share a `name`.
  const reactId = useId();
  const listId = `${reactId}-${name}-suggestions`;

  const add = (raw: string) => {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    const k = dedupeKey(value);
    setTokens((prev) =>
      prev.some((t) => dedupeKey(t) === k) ? prev : [...prev, value]
    );
    setDraft("");
  };

  const remove = (token: string) => {
    const k = dedupeKey(token);
    setTokens((prev) => prev.filter((t) => dedupeKey(t) !== k));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && tokens.length > 0) {
      remove(tokens[tokens.length - 1]);
    }
  };

  const selectedKeys = new Set(tokens.map(dedupeKey));
  const mostUsed = useMemo(
    () =>
      [...options]
        .sort((a, b) => b.count - a.count)
        .filter((o) => !selectedKeys.has(dedupeKey(o.label)))
        .slice(0, 10),
    [options, tokens] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={tokens.join(", ")} />
      <div
        className={cn(
          controlClass,
          "flex min-h-[38px] flex-wrap items-center gap-1.5 py-1.5"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tokens.map((t) => (
          <span
            key={dedupeKey(t)}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
          >
            {t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              aria-label={`Remove ${t}`}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-50"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          list={listId}
          placeholder={tokens.length === 0 ? tr("admin.editor.addTags") : ""}
          className="min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 dark:text-zinc-50"
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.slug} value={o.label} />
          ))}
        </datalist>
      </div>
      {mostUsed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{tr("admin.editor.mostUsed")}</span>
          {mostUsed.map((o) => (
            <button
              key={o.slug}
              type="button"
              onClick={() => add(o.label)}
              className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
