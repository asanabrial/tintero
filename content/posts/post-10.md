---
title: "Hexagonal Architecture in Practice"
date: "2025-07-20"
tags: ["architecture", "typescript"]
excerpt: "How to apply hexagonal architecture principles in a TypeScript project to achieve clean separation of concerns."
---

Hexagonal architecture (Ports and Adapters) separates business logic from infrastructure concerns.

## Core Concepts

- **Domain**: Pure business logic with no dependencies
- **Ports**: Interfaces the domain exposes or uses
- **Adapters**: Implementations of ports (database, HTTP, filesystem)

## Example: Content Repository Port

```typescript
interface ContentRepository {
  listPosts(options?: ListOptions): Promise<Paginated<Post>>;
  getPost(slug: string): Promise<Post | null>;
}
```

## Filesystem Adapter

```typescript
class FilesystemContentAdapter implements ContentRepository {
  constructor(private rootDir: string) {}

  async listPosts(): Promise<Paginated<Post>> {
    // Read from filesystem
  }
}
```

## Benefits

The domain never imports from adapters. Adapters are swappable without touching business rules.

## Testing

Because the port is an interface, you can provide a fake implementation for tests:

```typescript
const fakeRepo: ContentRepository = {
  async listPosts() { return { posts: [], total: 0, totalPages: 0 }; },
  async getPost() { return null; },
};
```

Hexagonal architecture makes large systems testable and maintainable.


**See also:** [[Building a REST API with Node.js]].
