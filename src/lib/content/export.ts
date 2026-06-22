// Pure export bundle builder — no FS, no Next.js, no new Date().
// exportedAt is INJECTED by the caller (route handler at request time).

import type { Post, Page, SiteConfig } from "./types";
import type { PostFrontmatter, PageFrontmatter } from "./schema";
import { pickPostFrontmatter, pickPageFrontmatter } from "@/lib/api/serialize";

export const BUNDLE_VERSION = 1 as const;

export interface BundleItem<FM> {
  slug: string;
  frontmatter: FM;
  raw: string;
}

export interface ExportBundle {
  version: number;
  exportedAt: string; // injected ISO string — no new Date() inside
  siteConfig: SiteConfig;
  posts: BundleItem<PostFrontmatter>[];
  pages: BundleItem<PageFrontmatter>[];
}

type RawResult = {
  frontmatter: Record<string, unknown>;
  rawData: Record<string, unknown>;
  body: string;
} | null;

export interface BuildExportInput {
  posts: { post: Post; raw: RawResult }[];
  pages: { page: Page; raw: RawResult }[];
  siteConfig: SiteConfig;
  exportedAt: string; // injected by the route (request-time)
}

export function buildExportBundle(input: BuildExportInput): ExportBundle {
  return {
    version: BUNDLE_VERSION,
    exportedAt: input.exportedAt,
    siteConfig: input.siteConfig,
    posts: input.posts.map(({ post, raw }) => ({
      slug: post.slug,
      frontmatter: pickPostFrontmatter(raw?.rawData ?? {}),
      raw: raw?.body ?? "",
    })),
    pages: input.pages.map(({ page, raw }) => ({
      slug: page.slug,
      frontmatter: pickPageFrontmatter(raw?.rawData ?? {}),
      raw: raw?.body ?? "",
    })),
  };
}
