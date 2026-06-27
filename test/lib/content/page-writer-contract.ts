/**
 * Adapter-agnostic PageWriter CRUD contract suite.
 *
 * Call runPageWriterContract(label, makeHarness) from any test file to
 * run the full behavioral contract against a specific page writer adapter.
 *
 * Consumers:
 *   - fs-page-writer.contract.test.ts   (regression — FsPageWriter is the oracle)
 *   - drizzle-page-writer.contract.test.ts  (GREEN gate for DrizzlePageWriter)
 *
 * Adapter-specific behaviors deliberately excluded:
 *   - ADR-7 extra-key preservation (FS-only)
 *   - Trash operations (Phase 5 Slice C — not yet implemented)
 *   - Authoritative filename-slug derivation (FS-only)
 *   - parent-not-found storage strategy (FS stores slug string regardless;
 *     DB adapter sets parent_id null when the parent slug is not found)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { PageWriter } from "@/lib/content/ports";
import type { ContentRepository } from "@/lib/content/ports";

// ============================================================
// Harness contract
// ============================================================

export interface PageWriterHarness {
  writer: PageWriter;
  reader: ContentRepository;
  cleanup(): Promise<void>;
}

// ============================================================
// Contract runner
// ============================================================

export function runPageWriterContract(
  label: string,
  makeHarness: () => Promise<PageWriterHarness>
): void {
  describe(`${label} — PageWriter contract`, () => {
    let h: PageWriterHarness;

    beforeEach(async () => {
      h = await makeHarness();
    });

    afterEach(async () => {
      await h.cleanup();
    });

    // ------------------------------------------------------------------
    // CREATE + READ BACK
    // ------------------------------------------------------------------

    test("createPage then getPage returns all written fields", async () => {
      const result = await h.writer.createPage({
        title: "About Us",
        date: "2024-01-15",
        body: "# About\n\nWe are a team.",
        excerpt: "We are a team.",
        status: "published",
        menuOrder: 2,
        seo: { title: "Custom SEO Title", metaDescription: "A short meta" },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const page = await h.reader.getPage(result.slug, { includeDrafts: true });
      expect(page).not.toBeNull();
      if (!page) return;

      expect(page.title).toBe("About Us");
      expect(page.date).toBe("2024-01-15");
      expect(page.status).toBe("published");
      expect(page.excerpt).toBe("We are a team.");
      expect(page.menuOrder).toBe(2);
      // Rendered HTML must be non-empty for a non-empty body
      expect(page.html.length).toBeGreaterThan(0);
      expect(page.seo?.title).toBe("Custom SEO Title");
      expect(page.seo?.metaDescription).toBe("A short meta");
    });

    test("createPage with explicit slug uses that slug", async () => {
      const result = await h.writer.createPage({
        title: "My Page",
        slug: "my-custom-slug",
        date: "2024-01-15",
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-custom-slug");

      const page = await h.reader.getPage("my-custom-slug", { includeDrafts: true });
      expect(page).not.toBeNull();
    });

    test("createPage auto-resolves slug collision with -2 suffix", async () => {
      const first = await h.writer.createPage({
        title: "Foo Bar",
        date: "2024-01-15",
        body: "first",
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.slug).toBe("foo-bar");

      const second = await h.writer.createPage({
        title: "Foo Bar",
        date: "2024-01-16",
        body: "second",
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.slug).toBe("foo-bar-2");

      const p1 = await h.reader.getPage("foo-bar", { includeDrafts: true });
      const p2 = await h.reader.getPage("foo-bar-2", { includeDrafts: true });
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();
    });

    test("createPage draft status: getPage with includeDrafts returns draft page", async () => {
      const result = await h.writer.createPage({
        title: "Draft Page",
        date: "2024-01-15",
        status: "draft",
        body: "draft body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const page = await h.reader.getPage(result.slug, { includeDrafts: true });
      expect(page).not.toBeNull();
      if (!page) return;
      expect(page.status).toBe("draft");
    });

    // ------------------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------------------

    test("updatePage edits fields in place (same slug)", async () => {
      const created = await h.writer.createPage({
        title: "Original Title",
        date: "2024-01-15",
        status: "draft",
        body: "old body",
        menuOrder: 1,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      const updated = await h.writer.updatePage(slug, {
        title: "Updated Title",
        date: "2024-02-01",
        status: "published",
        body: "new body",
        menuOrder: 5,
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe(slug);

      const page = await h.reader.getPage(slug, { includeDrafts: true });
      expect(page).not.toBeNull();
      if (!page) return;
      expect(page.title).toBe("Updated Title");
      expect(page.date).toBe("2024-02-01");
      expect(page.status).toBe("published");
      expect(page.menuOrder).toBe(5);
    });

    test("updatePage renames slug: old slug gone, new slug present", async () => {
      const created = await h.writer.createPage({
        title: "Old Page",
        date: "2024-01-15",
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updated = await h.writer.updatePage(created.slug, {
        title: "Old Page",
        slug: "brand-new-slug",
        date: "2024-01-15",
        body: "body",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe("brand-new-slug");

      const oldPage = await h.reader.getPage(created.slug, { includeDrafts: true });
      expect(oldPage).toBeNull();

      const newPage = await h.reader.getPage("brand-new-slug", { includeDrafts: true });
      expect(newPage).not.toBeNull();
    });

    test("updatePage rename collision → slug_collision error", async () => {
      await h.writer.createPage({
        title: "Page A",
        slug: "page-a",
        date: "2024-01-15",
        body: "a",
      });
      await h.writer.createPage({
        title: "Page B",
        slug: "page-b",
        date: "2024-01-15",
        body: "b",
      });

      const result = await h.writer.updatePage("page-a", {
        title: "Page A",
        slug: "page-b", // taken by page-b
        date: "2024-01-15",
        body: "a",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("slug_collision");

      // page-a must still be readable (no mutation on collision)
      const pageA = await h.reader.getPage("page-a", { includeDrafts: true });
      expect(pageA).not.toBeNull();
    });

    test("updatePage non-existent → page_not_found", async () => {
      const result = await h.writer.updatePage("does-not-exist-xyz", {
        title: "Page",
        date: "2024-01-15",
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("page_not_found");
    });

    test("updatePage with same explicit slug does not return slug_collision", async () => {
      const created = await h.writer.createPage({
        title: "Same Slug Page",
        slug: "same-slug-page",
        date: "2024-07-01",
        body: "original body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Update with the SAME slug explicitly provided in the input
      const updated = await h.writer.updatePage(created.slug, {
        title: "Same Slug Page Updated",
        slug: created.slug, // same slug — must not be treated as a collision
        date: "2024-07-01",
        body: "updated body",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe("same-slug-page");

      const page = await h.reader.getPage("same-slug-page", { includeDrafts: true });
      expect(page).not.toBeNull();
      expect(page?.title).toBe("Same Slug Page Updated");
    });

    // ------------------------------------------------------------------
    // PARENT SLUG ROUND-TRIP
    // ------------------------------------------------------------------

    test("parent slug round-trip: child getPage returns parent slug", async () => {
      // Create the parent page first
      const parent = await h.writer.createPage({
        title: "Services",
        date: "2024-01-10",
        body: "Services body.",
      });
      expect(parent.ok).toBe(true);
      if (!parent.ok) return;

      // Create child page referencing parent by slug
      const child = await h.writer.createPage({
        title: "Web Design",
        date: "2024-01-11",
        body: "Web design body.",
        parent: parent.slug,
      });
      expect(child.ok).toBe(true);
      if (!child.ok) return;

      const childPage = await h.reader.getPage(child.slug, { includeDrafts: true });
      expect(childPage).not.toBeNull();
      if (!childPage) return;
      expect(childPage.parent).toBe(parent.slug);
    });

    test("readRawPage returns parent slug for child page", async () => {
      const parent = await h.writer.createPage({
        title: "Services",
        date: "2024-01-10",
        body: "Services body.",
      });
      expect(parent.ok).toBe(true);
      if (!parent.ok) return;

      const child = await h.writer.createPage({
        title: "Web Design",
        date: "2024-01-11",
        body: "Web design body.",
        parent: parent.slug,
      });
      expect(child.ok).toBe(true);
      if (!child.ok) return;

      const raw = await h.writer.readRawPage(child.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;
      const parentSlug = raw.frontmatter.parent ?? raw.rawData.parent;
      expect(parentSlug).toBe(parent.slug);
    });

    test("updatePage with parent preserves parent after update", async () => {
      const parent = await h.writer.createPage({
        title: "Parent",
        date: "2024-01-10",
        body: "Parent body.",
      });
      expect(parent.ok).toBe(true);
      if (!parent.ok) return;

      const child = await h.writer.createPage({
        title: "Child",
        date: "2024-01-11",
        body: "Child body.",
        parent: parent.slug,
      });
      expect(child.ok).toBe(true);
      if (!child.ok) return;

      // Update the child, keeping the same parent
      const updated = await h.writer.updatePage(child.slug, {
        title: "Child Updated",
        date: "2024-01-11",
        body: "Child updated body.",
        parent: parent.slug,
      });
      expect(updated.ok).toBe(true);

      const childPage = await h.reader.getPage(child.slug, { includeDrafts: true });
      expect(childPage?.parent).toBe(parent.slug);
    });

    // ------------------------------------------------------------------
    // SET PAGE STATUS
    // ------------------------------------------------------------------

    test("setPageStatus flips draft → published → draft", async () => {
      const created = await h.writer.createPage({
        title: "Status Page",
        date: "2024-01-15",
        status: "draft",
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      // Flip to published
      const pub = await h.writer.setPageStatus(slug, "published");
      expect(pub.ok).toBe(true);
      const pubPage = await h.reader.getPage(slug, { includeDrafts: true });
      expect(pubPage?.status).toBe("published");

      // Flip back to draft
      const draftResult = await h.writer.setPageStatus(slug, "draft");
      expect(draftResult.ok).toBe(true);
      const draftPage = await h.reader.getPage(slug, { includeDrafts: true });
      expect(draftPage?.status).toBe("draft");
    });

    test("setPageStatus non-existent → page_not_found", async () => {
      const result = await h.writer.setPageStatus("non-existent-page", "published");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("page_not_found");
    });

    // ------------------------------------------------------------------
    // DELETE
    // ------------------------------------------------------------------

    test("deletePage removes page (getPage returns null)", async () => {
      const created = await h.writer.createPage({
        title: "To Delete",
        date: "2024-01-15",
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      const del = await h.writer.deletePage(slug);
      expect(del.ok).toBe(true);

      const page = await h.reader.getPage(slug, { includeDrafts: true });
      expect(page).toBeNull();
    });

    test("deletePage absent → ok:true (graceful)", async () => {
      const result = await h.writer.deletePage("does-not-exist-abc");
      expect(result.ok).toBe(true);
    });

    // ------------------------------------------------------------------
    // READ RAW
    // ------------------------------------------------------------------

    test("readRawPage returns null for non-existent page", async () => {
      const raw = await h.writer.readRawPage("no-such-page-xyz");
      expect(raw).toBeNull();
    });

    test("readRawPage round-trips title, date, body, excerpt, menuOrder", async () => {
      const created = await h.writer.createPage({
        title: "Round Trip Page",
        date: "2024-03-01",
        body: "raw body text",
        excerpt: "short excerpt",
        menuOrder: 3,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const raw = await h.writer.readRawPage(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      // Body is the raw markdown — must contain the written text
      expect(raw.body.trim()).toContain("raw body text");

      // Title
      expect(raw.frontmatter.title).toBe("Round Trip Page");

      // Date — FS oracle returns a Date object (gray-matter parses YYYY-MM-DD);
      // DB adapter returns a string. Both are valid per contract.
      const date = raw.frontmatter.date ?? raw.rawData.date;
      const dateStr = date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
      expect(dateStr).toBe("2024-03-01");

      // Excerpt — present when non-empty
      const excerpt = raw.frontmatter.excerpt ?? raw.rawData.excerpt;
      expect(excerpt).toBe("short excerpt");

      // menu_order — present when non-zero
      const menuOrder = raw.frontmatter.menu_order ?? raw.rawData.menu_order;
      expect(menuOrder).toBe(3);
    });

    // ------------------------------------------------------------------
    // SEO LIFECYCLE
    // ------------------------------------------------------------------

    test("seo: createPage with seo, getPage reflects seo fields", async () => {
      const created = await h.writer.createPage({
        title: "SEO Page",
        date: "2024-04-01",
        body: "seo body",
        seo: {
          title: "Custom SEO Title",
          metaDescription: "A meta description",
          cornerstone: true,
        },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const page = await h.reader.getPage(created.slug, { includeDrafts: true });
      expect(page?.seo).toBeDefined();
      expect(page?.seo?.title).toBe("Custom SEO Title");
      expect(page?.seo?.metaDescription).toBe("A meta description");
      expect(page?.seo?.cornerstone).toBe(true);
    });

    test("seo: updatePage changes a seo field, reader reflects new value", async () => {
      const created = await h.writer.createPage({
        title: "SEO Update Page",
        date: "2024-04-02",
        body: "body",
        seo: { title: "Original SEO" },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updated = await h.writer.updatePage(created.slug, {
        title: "SEO Update Page",
        date: "2024-04-02",
        body: "body",
        seo: { title: "Updated SEO", metaDescription: "New desc" },
      });
      expect(updated.ok).toBe(true);

      const page = await h.reader.getPage(created.slug, { includeDrafts: true });
      expect(page?.seo?.title).toBe("Updated SEO");
      expect(page?.seo?.metaDescription).toBe("New desc");
    });

    test("seo: updatePage removes seo — getPage and readRawPage reflect removal", async () => {
      const created = await h.writer.createPage({
        title: "SEO Remove Page",
        date: "2024-04-03",
        body: "body",
        seo: { title: "Will Be Removed", focusKeyphrase: "to remove" },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Update with empty seo strings — cleanSeo returns undefined → seo removed
      const updated = await h.writer.updatePage(created.slug, {
        title: "SEO Remove Page",
        date: "2024-04-03",
        body: "body",
        seo: { title: "", focusKeyphrase: "" },
      });
      expect(updated.ok).toBe(true);

      // getPage should have no seo
      const page = await h.reader.getPage(created.slug, { includeDrafts: true });
      expect(page?.seo).toBeUndefined();

      // readRawPage should also have no seo
      const raw = await h.writer.readRawPage(created.slug);
      const seo = raw?.rawData.seo ?? raw?.frontmatter.seo;
      expect(seo).toBeUndefined();
    });

    test("seo: readRawPage round-trips seo fields (title and noindex boolean)", async () => {
      const created = await h.writer.createPage({
        title: "SEO Raw Page",
        date: "2024-05-01",
        body: "body",
        seo: { title: "SEO Title", noindex: true },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const raw = await h.writer.readRawPage(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      const seo = (raw.rawData.seo ?? raw.frontmatter.seo) as
        | Record<string, unknown>
        | undefined;
      expect(seo).toBeDefined();
      if (!seo) return;
      expect(seo.title).toBe("SEO Title");
      expect(seo.noindex).toBe(true);
    });

    // ------------------------------------------------------------------
    // SLUG REUSE AFTER DELETE
    // ------------------------------------------------------------------

    test("slug reuse after delete: same title gets original base slug", async () => {
      const first = await h.writer.createPage({
        title: "Reuse Slug",
        date: "2024-07-01",
        body: "first body",
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const originalSlug = first.slug; // e.g. "reuse-slug"

      const del = await h.writer.deletePage(originalSlug);
      expect(del.ok).toBe(true);

      const second = await h.writer.createPage({
        title: "Reuse Slug",
        date: "2024-07-02",
        body: "second body",
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      // Slug was freed by delete — no -2 suffix expected
      expect(second.slug).toBe(originalSlug);
    });

    // ------------------------------------------------------------------
    // TRASH LIFECYCLE (Phase 5 Slice C)
    // ------------------------------------------------------------------

    describe("trash lifecycle", () => {
      test("trashPage: live page → getPage null AND appears in listTrashedPages with correct fields", async () => {
        const created = await h.writer.createPage({
          title: "Trash Me Page",
          date: "2024-06-01",
          body: "body",
          status: "published",
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const slug = created.slug;

        const trashed = await h.writer.trashPage(slug);
        expect(trashed.ok).toBe(true);

        // getPage returns null for a trashed page (even with includeDrafts)
        const page = await h.reader.getPage(slug, { includeDrafts: true });
        expect(page).toBeNull();

        // listTrashedPages includes the item with correct fields
        const trashList = await h.writer.listTrashedPages();
        const found = trashList.find((item) => item.slug === slug);
        expect(found).toBeDefined();
        if (!found) return;
        expect(found.title).toBe("Trash Me Page");
        expect(found.date).toBe("2024-06-01");
      });

      test("restorePage: trashed → getPage returns it again, gone from listTrashedPages", async () => {
        const created = await h.writer.createPage({
          title: "Restore Me Page",
          date: "2024-06-02",
          body: "restore body",
          status: "draft",
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const slug = created.slug;

        await h.writer.trashPage(slug);
        const restored = await h.writer.restorePage(slug);
        expect(restored.ok).toBe(true);

        // getPage finds it again after restore
        const page = await h.reader.getPage(slug, { includeDrafts: true });
        expect(page).not.toBeNull();
        expect(page?.title).toBe("Restore Me Page");

        // listTrashedPages no longer includes it
        const trashList = await h.writer.listTrashedPages();
        const found = trashList.find((item) => item.slug === slug);
        expect(found).toBeUndefined();
      });

      test("restorePage: collision when live page exists with same slug → slug_collision", async () => {
        // Create and trash the original page
        const created = await h.writer.createPage({
          title: "Collision Target Page",
          slug: "collision-target-page",
          date: "2024-06-03",
          body: "original",
          status: "published",
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const slug = created.slug;

        await h.writer.trashPage(slug);

        // Create a new live page with the same slug (trashed page frees the live slot)
        const second = await h.writer.createPage({
          title: "Collision Target Page",
          slug: "collision-target-page",
          date: "2024-06-04",
          body: "new page",
          status: "published",
        });
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.slug).toBe(slug);

        // Now restore the trashed page → slug_collision
        const restored = await h.writer.restorePage(slug);
        expect(restored.ok).toBe(false);
        if (restored.ok) return;
        expect(restored.error.kind).toBe("slug_collision");
      });

      test("permanentlyDeletePage: removes from trash; subsequent restore → page_not_found", async () => {
        const created = await h.writer.createPage({
          title: "Permanent Delete Page",
          date: "2024-06-05",
          body: "body",
          status: "published",
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const slug = created.slug;

        await h.writer.trashPage(slug);

        const permaDelete = await h.writer.permanentlyDeletePage(slug);
        expect(permaDelete.ok).toBe(true);

        // Gone from listTrashedPages
        const trashList = await h.writer.listTrashedPages();
        const found = trashList.find((item) => item.slug === slug);
        expect(found).toBeUndefined();

        // restorePage on a permanently-deleted slug → page_not_found
        const restored = await h.writer.restorePage(slug);
        expect(restored.ok).toBe(false);
        if (restored.ok) return;
        expect(restored.error.kind).toBe("page_not_found");
      });

      test("trashPage: non-existent slug → page_not_found", async () => {
        const result = await h.writer.trashPage("does-not-exist-trash-page-xyz");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("page_not_found");
      });

      test("permanentlyDeletePage: slug not in trash → ok:true (graceful)", async () => {
        const result = await h.writer.permanentlyDeletePage("not-in-trash-page-xyz");
        expect(result.ok).toBe(true);
      });
    });
  });
}
