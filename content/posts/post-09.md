---
title: "Testing with Bun"
date: "2025-08-01"
tags: ["testing", "javascript"]
excerpt: "Bun ships with a built-in test runner. Here is how to write effective tests with it."
---

Bun includes a fast built-in test runner compatible with Jest's API.

## Basic Test Structure

```javascript
import { test, expect, describe } from "bun:test";

describe("math utils", () => {
  test("adds two numbers", () => {
    expect(1 + 1).toBe(2);
  });

  test("multiplies correctly", () => {
    expect(3 * 4).toBe(12);
  });
});
```

## Running Tests

```bash
bun test
bun test path/to/specific.test.ts
bun test --watch
```

## Async Tests

```javascript
test("fetches data", async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});
```

## Mocking

Bun supports `mock()` for function mocking:

```javascript
import { mock } from "bun:test";
const fn = mock(() => 42);
```

Bun's test runner is fast and requires no configuration.


**See also:** [[Open Source Tooling Overview]].
