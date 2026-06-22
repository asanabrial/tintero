import { slugifyTag } from "./tag";
import type { Post } from "./types";

export interface AuthorEntry {
  name: string;
  slug: string;
  count: number;
}

export function slugifyAuthor(name: string): string {
  return slugifyTag(name);
}

export function filterPostsByAuthor(posts: Post[], slug: string): Post[] {
  return posts.filter((p) => slugifyAuthor(p.author) === slug);
}

export function buildAuthorIndex(posts: Post[]): AuthorEntry[] {
  const map = new Map<string, { name: string; count: number }>();
  for (const post of posts) {
    const slug = slugifyAuthor(post.author);
    if (!slug) continue; // defense-in-depth; author is always non-empty post-WU1
    if (!map.has(slug)) {
      map.set(slug, { name: post.author, count: 1 });
    } else {
      map.get(slug)!.count++;
    }
  }
  return Array.from(map.entries())
    .map(([slug, { name, count }]) => ({ slug, name, count }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
