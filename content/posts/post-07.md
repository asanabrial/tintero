---
title: "Tailwind CSS Best Practices"
date: "2025-09-01"
tags: ["css", "tailwind"]
excerpt: "Tips and patterns for writing maintainable Tailwind CSS code at scale."
---

Tailwind CSS is a utility-first framework that enables rapid UI development.

## Avoid Premature Abstraction

Don't reach for components too early. Utility classes inline are fine for one-offs.

## Use Component Extraction Wisely

When you find yourself repeating the same combination of utilities, extract a component:

```html
<!-- Instead of repeating -->
<button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  Submit
</button>
```

## Responsive Design

Tailwind's responsive prefixes make breakpoints explicit:

```html
<div class="text-sm md:text-base lg:text-lg">
  Responsive text
</div>
```

## Dark Mode

Use the `dark:` variant for dark mode:

```html
<div class="bg-white dark:bg-gray-900 text-black dark:text-white">
  Supports dark mode
</div>
```

These patterns keep your Tailwind code maintainable as projects grow.


**See also:** [[CSS Grid Mastery]].
