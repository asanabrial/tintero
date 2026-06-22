---
title: "Code Block Body Post"
date: "2024-05-01"
tags: ["test"]
---

This post contains a TypeScript code block:

```typescript
interface User {
  id: number;
  name: string;
}

function getUser(id: number): User {
  return { id, name: "Alice" };
}
```

And an unknown language block:

```unknownlang
this is unknown language code
```

Both should render without errors.
