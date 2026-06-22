---
title: "Date Prefix Post Example"
date: "2024-01-15"
tags: ["example"]
excerpt: "This post has a date prefix in the filename. The slug strips the date prefix."
---

This post's filename starts with `2024-01-15-`. The slug will be `date-prefix-post`.

## How Date Prefixes Work

Files named `YYYY-MM-DD-my-post.md` have the date prefix stripped when deriving the slug. This allows you to sort posts chronologically in your filesystem while keeping clean URLs.

## Example

| Filename | Slug |
|----------|------|
| `2024-01-15-my-post.md` | `my-post` |
| `2024-01-15-date-prefix-post.md` | `date-prefix-post` |
