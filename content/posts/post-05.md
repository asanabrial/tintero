---
title: "React Server Components Deep Dive"
date: "2025-10-05"
tags: ["react", "typescript"]
excerpt: "Understanding React Server Components and how they change the way we build applications."
---

React Server Components (RSC) represent a fundamental shift in how React applications are built.

## What Are Server Components?

Server Components are React components that render exclusively on the server. They can:

- Access databases directly
- Read from the filesystem
- Call internal APIs without exposing them to the client

## Data Fetching Pattern

```typescript
async function PostList() {
  const posts = await db.posts.findAll();
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

## No Client JavaScript

Server Components produce zero JavaScript on the client, reducing bundle size significantly.

## Interleaving

You can mix Server and Client components in the same tree, giving you granular control over what ships to the client.


**See also:** [[Next.js App Router Guide]].
