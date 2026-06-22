---
title: "Getting Started with TypeScript"
date: "2025-12-01"
tags: ["typescript", "javascript"]
excerpt: "A practical introduction to TypeScript for JavaScript developers."
---

TypeScript is a strongly typed superset of JavaScript that compiles to plain JavaScript. This post walks you through the basics.

## Why TypeScript?

TypeScript adds static types to JavaScript, catching errors at compile time rather than runtime.

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
```

## Getting Started

Install TypeScript globally:

```bash
npm install -g typescript
```

Then initialize a project:

```bash
tsc --init
```

## Type Annotations

TypeScript lets you annotate variables, function parameters, and return types:

```typescript
const count: number = 42;
const message: string = "Hello";
const active: boolean = true;
```

This is just the beginning of what TypeScript offers.


**See also:** [[Advanced TypeScript Patterns]], [[Building Open Source TypeScript Libraries]].
