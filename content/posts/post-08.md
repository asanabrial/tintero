---
title: "Git Workflow for Teams"
date: "2025-08-15"
tags: ["git", "workflow"]
excerpt: "A practical Git workflow that scales from solo projects to large teams."
---

A consistent Git workflow reduces conflicts and makes code review easier.

## Feature Branch Workflow

1. Create a branch for each feature or bug fix
2. Commit early and often
3. Open a pull request for review
4. Merge only when approved

## Commit Message Convention

Follow Conventional Commits:

```bash
feat: add user authentication
fix: resolve navigation overflow on mobile
docs: update API reference
chore: upgrade dependencies
```

## Rebase vs Merge

| Strategy | When to Use |
|----------|-------------|
| Merge | Preserving full history |
| Rebase | Linear history before PR |
| Squash | Clean up noisy commits |

## Conflict Resolution

Always pull before pushing, and address conflicts promptly.

Good Git hygiene makes collaboration smooth.


**See also:** [[Testing with Bun]], [[Open Source Tooling Overview]].
