"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import {
  getSiteConfigWriter,
  moveItem,
  reconstructNav,
} from "@/lib/content/site-config-writer";
import { NavItemSchema, NavLeafSchema } from "@/lib/content/schema";
import type { NavItem } from "@/lib/content/schema";
import { applyAddLinkIntent } from "./menu-item-picker";

// ============================================================
// Types
// ============================================================

export type NavActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      itemErrors?: Record<
        number,
        {
          label?: string;
          href?: string;
          childErrors?: Record<number, { label?: string; href?: string }>;
        }
      >;
    }
  | undefined;

// ============================================================
// updateNavAction
// ============================================================

/**
 * Server Action: update site nav (writes config/site.yaml nav array).
 * verifySession() is the FIRST call — spec Authentication Guard.
 * Validate-before-write: any item validation failure returns typed error WITHOUT writing.
 * On success: updateTag("site-config") BEFORE redirect() (ADR-4 ordering).
 */
export async function updateNavAction(
  _prev: NavActionState,
  formData: FormData
): Promise<NavActionState> {
  // AUTH GUARD — must be first
  const session = await verifySession();

  if (!can(session.role, "menus:manage")) {
    return { ok: false, error: "admin.errors.noPermission" };
  }

  // Parse intent from the button that submitted the form
  const intent = ((formData.get("_intent") as string | null) ?? "save").trim();

  // Reconstruct base nav array from indexed FormData fields
  const base = reconstructNav(formData);

  // Apply mutation based on intent
  let array: NavItem[];

  if (intent === "save") {
    array = base;
  } else if (intent === "add") {
    const addLabel = ((formData.get("add_label") as string | null) ?? "").trim();
    const addHref = ((formData.get("add_href") as string | null) ?? "").trim();
    array = [...base, { label: addLabel, href: addHref }];
  } else if (intent === "add-link") {
    const addLinkLabel = ((formData.get("add_link_label") as string | null) ?? "").trim();
    const addLinkHref = ((formData.get("add_link_href") as string | null) ?? "").trim();
    array = applyAddLinkIntent(base, addLinkLabel, addLinkHref);
  } else if (intent.startsWith("remove:")) {
    const idx = parseInt(intent.slice("remove:".length), 10);
    array = base.filter((_, i) => i !== idx);
  } else if (intent.startsWith("move-up:")) {
    const idx = parseInt(intent.slice("move-up:".length), 10);
    array = moveItem(base, idx, "up");
  } else if (intent.startsWith("move-down:")) {
    const idx = parseInt(intent.slice("move-down:".length), 10);
    array = moveItem(base, idx, "down");
  } else if (intent.startsWith("add-child:")) {
    const idx = parseInt(intent.slice("add-child:".length), 10);
    const addChildLabel = (
      (formData.get(`add_child_label_${idx}`) as string | null) ?? ""
    ).trim();
    const addChildHref = (
      (formData.get(`add_child_href_${idx}`) as string | null) ?? ""
    ).trim();
    array = base.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        children: [
          ...(item.children ?? []),
          { label: addChildLabel, href: addChildHref },
        ],
      };
    });
  } else if (intent.startsWith("remove-child:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      const newChildren = (item.children ?? []).filter((_, j) => j !== cIdx);
      return {
        ...item,
        children: newChildren.length > 0 ? newChildren : undefined,
      };
    });
  } else if (intent.startsWith("move-child-up:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      return { ...item, children: moveItem(item.children ?? [], cIdx, "up") };
    });
  } else if (intent.startsWith("move-child-down:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      return {
        ...item,
        children: moveItem(item.children ?? [], cIdx, "down"),
      };
    });
  } else {
    return { ok: false, error: "admin.errors.unknownIntent" };
  }

  // Validate EVERY item; collect itemErrors keyed by index
  const itemErrors: Record<
    number,
    {
      label?: string;
      href?: string;
      childErrors?: Record<number, { label?: string; href?: string }>;
    }
  > = {};
  for (let i = 0; i < array.length; i++) {
    const parsed = NavItemSchema.safeParse(array[i]);
    const errs: {
      label?: string;
      href?: string;
      childErrors?: Record<number, { label?: string; href?: string }>;
    } = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "label") errs.label = issue.message;
        if (field === "href") errs.href = issue.message;
      }
    }
    // Validate children
    if (array[i].children) {
      const childErrs: Record<number, { label?: string; href?: string }> = {};
      for (let j = 0; j < (array[i].children?.length ?? 0); j++) {
        const cparsed = NavLeafSchema.safeParse(array[i].children![j]);
        if (!cparsed.success) {
          const cerrs: { label?: string; href?: string } = {};
          for (const issue of cparsed.error.issues) {
            const field = issue.path[0];
            if (field === "label") cerrs.label = issue.message;
            if (field === "href") cerrs.href = issue.message;
          }
          childErrs[j] = cerrs;
        }
      }
      if (Object.keys(childErrs).length > 0) errs.childErrors = childErrs;
    }
    if (Object.keys(errs).length > 0) {
      itemErrors[i] = errs;
    }
  }

  if (Object.keys(itemErrors).length > 0) {
    // Validation failed — do NOT write
    return { ok: false, itemErrors };
  }

  // Write the validated nav array
  const writeResult = await getSiteConfigWriter().writeNav(array);
  if (!writeResult.ok) {
    return { ok: false, error: `Write failed: ${writeResult.error}` };
  }

  // Cache invalidation BEFORE redirect (ADR-4 ordering)
  // redirect() throws internally — code after it is unreachable
  updateTag("site-config");
  redirect("/admin/menus?saved=1");
}

// ============================================================
// updateFooterNavAction
// ============================================================

/**
 * Server Action: update site footer nav (writes config/site.yaml footerNav array).
 * Mirror of updateNavAction — same auth guard, intent handling, and write pattern.
 * Calls writeFooterNav instead of writeNav.
 */
export async function updateFooterNavAction(
  _prev: NavActionState,
  formData: FormData
): Promise<NavActionState> {
  // AUTH GUARD — must be first
  const session = await verifySession();

  if (!can(session.role, "menus:manage")) {
    return { ok: false, error: "admin.errors.noPermission" };
  }

  // Parse intent from the button that submitted the form
  const intent = ((formData.get("_intent") as string | null) ?? "save").trim();

  // Reconstruct base nav array from indexed FormData fields
  const base = reconstructNav(formData);

  // Apply mutation based on intent
  let array: NavItem[];

  if (intent === "save") {
    array = base;
  } else if (intent === "add") {
    const addLabel = ((formData.get("add_label") as string | null) ?? "").trim();
    const addHref = ((formData.get("add_href") as string | null) ?? "").trim();
    array = [...base, { label: addLabel, href: addHref }];
  } else if (intent === "add-link") {
    const addLinkLabel = ((formData.get("add_link_label") as string | null) ?? "").trim();
    const addLinkHref = ((formData.get("add_link_href") as string | null) ?? "").trim();
    array = applyAddLinkIntent(base, addLinkLabel, addLinkHref);
  } else if (intent.startsWith("remove:")) {
    const idx = parseInt(intent.slice("remove:".length), 10);
    array = base.filter((_, i) => i !== idx);
  } else if (intent.startsWith("move-up:")) {
    const idx = parseInt(intent.slice("move-up:".length), 10);
    array = moveItem(base, idx, "up");
  } else if (intent.startsWith("move-down:")) {
    const idx = parseInt(intent.slice("move-down:".length), 10);
    array = moveItem(base, idx, "down");
  } else if (intent.startsWith("add-child:")) {
    const idx = parseInt(intent.slice("add-child:".length), 10);
    const addChildLabel = (
      (formData.get(`add_child_label_${idx}`) as string | null) ?? ""
    ).trim();
    const addChildHref = (
      (formData.get(`add_child_href_${idx}`) as string | null) ?? ""
    ).trim();
    array = base.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        children: [
          ...(item.children ?? []),
          { label: addChildLabel, href: addChildHref },
        ],
      };
    });
  } else if (intent.startsWith("remove-child:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      const newChildren = (item.children ?? []).filter((_, j) => j !== cIdx);
      return {
        ...item,
        children: newChildren.length > 0 ? newChildren : undefined,
      };
    });
  } else if (intent.startsWith("move-child-up:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      return { ...item, children: moveItem(item.children ?? [], cIdx, "up") };
    });
  } else if (intent.startsWith("move-child-down:")) {
    const [, pi, ci] = intent.split(":");
    const pIdx = parseInt(pi, 10);
    const cIdx = parseInt(ci, 10);
    array = base.map((item, i) => {
      if (i !== pIdx) return item;
      return {
        ...item,
        children: moveItem(item.children ?? [], cIdx, "down"),
      };
    });
  } else {
    return { ok: false, error: "admin.errors.unknownIntent" };
  }

  // Validate EVERY item; collect itemErrors keyed by index
  const itemErrors: Record<
    number,
    {
      label?: string;
      href?: string;
      childErrors?: Record<number, { label?: string; href?: string }>;
    }
  > = {};
  for (let i = 0; i < array.length; i++) {
    const parsed = NavItemSchema.safeParse(array[i]);
    const errs: {
      label?: string;
      href?: string;
      childErrors?: Record<number, { label?: string; href?: string }>;
    } = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "label") errs.label = issue.message;
        if (field === "href") errs.href = issue.message;
      }
    }
    // Validate children
    if (array[i].children) {
      const childErrs: Record<number, { label?: string; href?: string }> = {};
      for (let j = 0; j < (array[i].children?.length ?? 0); j++) {
        const cparsed = NavLeafSchema.safeParse(array[i].children![j]);
        if (!cparsed.success) {
          const cerrs: { label?: string; href?: string } = {};
          for (const issue of cparsed.error.issues) {
            const field = issue.path[0];
            if (field === "label") cerrs.label = issue.message;
            if (field === "href") cerrs.href = issue.message;
          }
          childErrs[j] = cerrs;
        }
      }
      if (Object.keys(childErrs).length > 0) errs.childErrors = childErrs;
    }
    if (Object.keys(errs).length > 0) {
      itemErrors[i] = errs;
    }
  }

  if (Object.keys(itemErrors).length > 0) {
    // Validation failed — do NOT write
    return { ok: false, itemErrors };
  }

  // Write the validated footerNav array
  const writeResult = await getSiteConfigWriter().writeFooterNav(array);
  if (!writeResult.ok) {
    return { ok: false, error: `Write failed: ${writeResult.error}` };
  }

  // Cache invalidation BEFORE redirect (ADR-4 ordering)
  updateTag("site-config");
  redirect("/admin/menus?saved=1");
}
