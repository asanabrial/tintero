---
title: "Next.js App Router Guide"
date: "2025-06-05"
tags: ["react", "typescript", "next"]
excerpt: "A comprehensive guide to the Next.js App Router including layouts, loading states, and data fetching."
---

The Next.js App Router introduces a new paradigm for building React applications.

## File-Based Routing

Each folder in `app/` represents a route segment:

```
app/
  page.tsx          → /
  blog/
    page.tsx        → /blog
    [slug]/
      page.tsx      → /blog/:slug
```

## Layouts

Layouts wrap pages and persist across navigations:

```typescript
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>Blog Nav</nav>
      {children}
    </div>
  );
}
```

## Server Actions

Mutate data directly from Server Components:

```typescript
async function createPost(formData: FormData) {
  "use server";
  const title = formData.get("title");
  await db.posts.create({ title });
}
```

## Static Generation

Use `generateStaticParams` for static routes:

```typescript
export async function generateStaticParams() {
  const posts = await listPosts();
  return posts.map(post => ({ slug: post.slug }));
}
```

The App Router unlocks powerful new patterns for React applications.


**See also:** [[React Server Components Deep Dive]], [[Building a REST API with Node.js]].
