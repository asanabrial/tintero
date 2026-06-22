---
title: "No Excerpt Fixture"
date: "2024-07-01"
tags: ["test", "fixture"]
---

This post intentionally has no excerpt field in its frontmatter so that the autoExcerpt function is exercised during testing. The body text is deliberately longer than one hundred and sixty characters to ensure the truncation logic runs correctly and produces a non-empty excerpt that does not exceed the character limit. Additional filler text follows here to pad the body further.

## Section With Heading

More content after a heading to test that heading markdown syntax is stripped from the auto-generated excerpt.
