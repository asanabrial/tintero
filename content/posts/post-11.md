---
title: "Understanding Async/Await in JavaScript"
date: "2025-07-05"
tags: ["javascript"]
excerpt: "A clear explanation of async/await syntax and how it simplifies asynchronous programming."
---

Async/await makes asynchronous code look and behave like synchronous code.

## The Basics

```javascript
async function fetchUser(id) {
  const response = await fetch(`/api/users/${id}`);
  const user = await response.json();
  return user;
}
```

## Error Handling

Use try/catch with async/await:

```javascript
async function safeGet(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (error) {
    console.error("Request failed:", error);
    return null;
  }
}
```

## Parallel Execution

Don't await sequentially when operations are independent:

```javascript
// Sequential (slow)
const a = await fetchA();
const b = await fetchB();

// Parallel (fast)
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

Async/await is now the standard for asynchronous JavaScript. It is also where good tests earn their keep — Testing with Bun covers running async specs without extra setup.


**See also:** [[Deep Dive into JavaScript Async Patterns]], [[Understanding Closures in JavaScript]].
