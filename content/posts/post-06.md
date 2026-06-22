---
title: "Understanding Closures in JavaScript"
date: "2025-09-18"
tags: ["javascript"]
excerpt: "Closures are one of JavaScript's most powerful features. Learn how they work and when to use them."
---

Closures are created when a function retains access to its outer scope even after that outer function has returned.

## Basic Closure Example

```javascript
function makeCounter() {
  let count = 0;
  return function() {
    count += 1;
    return count;
  };
}

const counter = makeCounter();
console.log(counter()); // 1
console.log(counter()); // 2
```

## Practical Uses

Closures are used for:

| Use Case | Example |
|----------|---------|
| Data privacy | Private variables via closure |
| Partial application | Bind some arguments upfront |
| Memoization | Cache results in closure |

## The Classic Loop Problem

Without closures, `var` in loops causes unexpected behavior:

```javascript
// Problem
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100); // Always 3
}

// Fix with closure
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 100); // 0, 1, 2
}
```

Understanding closures is fundamental to JavaScript mastery.


**See also:** [[Understanding Async/Await in JavaScript]], [[Deep Dive into JavaScript Async Patterns]].
