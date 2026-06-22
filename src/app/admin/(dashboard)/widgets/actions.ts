"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getWidgetsConfigWriter } from "@/lib/widgets/widgets-config-writer";
import { WidgetSchema } from "@/lib/widgets/schema";
import type { Widget } from "@/lib/widgets/types";

export type WidgetActionState =
  | { ok: true }
  | { ok: false; error?: string; itemErrors?: Record<number, string> }
  | undefined;

export async function updateWidgetsAction(
  _prev: WidgetActionState,
  formData: FormData
): Promise<WidgetActionState> {
  const session = await verifySession();
  if (!can(session.role, "appearance:manage")) {
    return { ok: false, error: "You do not have permission to manage widgets." };
  }

  const intent = (
    (formData.get("_intent") as string | null) ?? "save"
  ).trim();
  const base = reconstructWidgets(formData);

  let array: Widget[];

  if (intent === "save") {
    array = base;
  } else if (intent === "add") {
    const type =
      (formData.get("add_type") as string | null)?.trim() ?? "search";
    const addTitle =
      (formData.get("add_title") as string | null)?.trim() ?? "";
    const addCount = parseInt(
      (formData.get("add_count") as string | null) ?? "5",
      10
    );
    const addHtml =
      (formData.get("add_html") as string | null)?.trim() ?? "";
    const newWidget: Widget = {
      type: type as Widget["type"],
      ...(addTitle ? { title: addTitle } : {}),
      ...(type === "recent-posts" && !isNaN(addCount)
        ? { count: addCount }
        : {}),
      ...(type === "custom-html" ? { html: addHtml } : {}),
    };
    array = [...base, newWidget];
  } else if (intent.startsWith("remove:")) {
    const idx = parseInt(intent.slice("remove:".length), 10);
    array = base.filter((_, i) => i !== idx);
  } else if (intent.startsWith("move-up:")) {
    const idx = parseInt(intent.slice("move-up:".length), 10);
    array = moveWidgetItem(base, idx, "up");
  } else if (intent.startsWith("move-down:")) {
    const idx = parseInt(intent.slice("move-down:".length), 10);
    array = moveWidgetItem(base, idx, "down");
  } else {
    return { ok: false, error: "Unknown intent" };
  }

  // Validate each item
  const itemErrors: Record<number, string> = {};
  for (let i = 0; i < array.length; i++) {
    const parsed = WidgetSchema.safeParse(array[i]);
    if (!parsed.success) {
      itemErrors[i] = parsed.error.issues.map((iss) => iss.message).join(", ");
    }
  }
  if (Object.keys(itemErrors).length > 0) {
    return { ok: false, itemErrors };
  }

  const writeResult = await getWidgetsConfigWriter().writeArea(
    "blog-sidebar",
    array
  );
  if (!writeResult.ok) {
    return { ok: false, error: `Write failed: ${writeResult.error}` };
  }

  updateTag("widgets");
  redirect("/admin/widgets?saved=1");
}

function reconstructWidgets(form: FormData): Widget[] {
  const countRaw = form.get("widget_count");
  const count = parseInt(
    typeof countRaw === "string" ? countRaw : "0",
    10
  );
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  const out: Widget[] = [];
  for (let i = 0; i < n; i++) {
    const type =
      (form.get(`widget[${i}][type]`) as string | null)?.trim() ?? "search";
    const title = (
      form.get(`widget[${i}][title]`) as string | null
    )?.trim();
    const countVal = parseInt(
      (form.get(`widget[${i}][count]`) as string | null) ?? "",
      10
    );
    const html = (
      form.get(`widget[${i}][html]`) as string | null
    )?.trim();
    const w: Widget = {
      type: type as Widget["type"],
      ...(title ? { title } : {}),
      ...(type === "recent-posts" && !isNaN(countVal)
        ? { count: countVal }
        : {}),
      ...(type === "custom-html" && html !== undefined ? { html } : {}),
    };
    out.push(w);
  }
  return out;
}

function moveWidgetItem<T>(arr: T[], index: number, dir: "up" | "down"): T[] {
  const next = [...arr];
  const target = dir === "up" ? index - 1 : index + 1;
  if (
    index < 0 ||
    index >= next.length ||
    target < 0 ||
    target >= next.length
  ) {
    return next;
  }
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
