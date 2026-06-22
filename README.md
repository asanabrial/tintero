# Tintero

A minimal, open-source blog engine built with Next.js 16, Tailwind CSS, and plain Markdown. No database, no CMS — just files.

## Why Tintero?

Most blog starters are either too opinionated (locking you into a CMS or a specific data model) or too barebones (leaving you to wire everything yourself). Tintero hits the middle ground:

- **Hexagonal content engine.** A clean `ContentRepository` port keeps your app layer decoupled from the filesystem. Swap in a database-backed adapter later without touching a single page.
- **Obsidian-vault tolerant.** Drop your vault into `content/` and start publishing. Wikilinks render as plain text; `.obsidian/` is ignored.
- **Static by default.** Every route is prerendered via `generateStaticParams`. Next.js 16 Cache Components (`use cache` + `cacheLife('max')`) ensure content is served from the edge on every deploy.
- **Zero JavaScript shipped to the browser.** All components are React Server Components. No hydration overhead.

## Quick Start

```bash
# Clone
git clone https://github.com/your-org/tintero.git
cd tintero

# Install dependencies (Bun required)
bun install

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Your blog is live.

> **Requires:** [Bun](https://bun.sh) v1.0+ and Node.js 20+.

## Project Structure

```
tintero/
├── config/
│   └── site.yaml          # Site metadata, nav, author, social links
├── content/
│   ├── posts/             # Blog posts (.md files)
│   └── pages/             # Static pages (.md files)
├── src/
│   ├── app/               # Next.js App Router routes + components
│   └── lib/content/       # Content engine (framework-agnostic)
└── test/                  # bun:test unit tests
```

## Writing Content

### Creating a Blog Post

Add a Markdown file to `content/posts/`:

```markdown
---
title: My First Post
date: 2025-01-15
tags: [javascript, web]
---

Your post body goes here. Full **GFM** support — tables, task lists, code blocks.
```

Supported frontmatter fields:

| Field     | Required | Default      | Description                        |
|-----------|----------|--------------|------------------------------------|
| `title`   | Yes      | —            | Post title                         |
| `date`    | Yes      | —            | ISO 8601 date (`YYYY-MM-DD`)       |
| `status`  | No       | `published`  | `published` or `draft`             |
| `tags`    | No       | `[]`         | Array of tag strings               |
| `excerpt`  | No       | Auto-generated | First 160 characters of body text |
| `slug`     | No       | Filename       | Override the URL slug              |
| `comments` | No       | `true`         | `true` to open comments, `false` to close them for this post |

**File conventions:**

- Flat file: `content/posts/my-post.md` → `/blog/my-post`
- Folder post: `content/posts/my-post/index.md` → `/blog/my-post`
- Date prefix: `content/posts/2025-01-15-my-post.md` → `/blog/my-post`

### Creating a Static Page

Add a Markdown file to `content/pages/`:

```markdown
---
title: About
date: 2025-01-01
---

About page content here.
```

This creates a route at `/pages/about`.

### Draft Posts

Set `status: draft` in frontmatter to hide a post from the listing, sitemap, and RSS feed in production. Drafts are visible in development (`NODE_ENV=development`).

## Configuring the Site

Edit `config/site.yaml`:

```yaml
title: My Blog
description: Writing about things I care about.
baseUrl: https://example.com
language: en
author:
  name: Your Name
  email: you@example.com
nav:
  - label: Home
    href: /
  - label: Blog
    href: /blog
social:
  github: your-handle
  twitter: your-handle
```

## Development Commands

```bash
bun run dev      # Start dev server (http://localhost:3000)
bun run build    # Production build
bun run start    # Serve production build
bun run lint     # Lint source files
bun test         # Run unit tests
```

## Feeds and SEO

- **Sitemap:** `/sitemap.xml` — generated at build time, includes all posts, pages, and tag pages.
- **RSS feed:** `/feed.xml` — last 20 published posts in RSS 2.0 format.

## Architecture

Tintero uses a hexagonal architecture to keep the content engine framework-agnostic:

```
FilesystemContentAdapter
  ↓ implements
ContentRepository (port)
  ↓ consumed by
RSC pages via getRepository()
```

The `getRepository()` factory wraps every repository call with Next.js 16 `'use cache'` + `cacheLife('max')` directives, so content is served from cache after the first build. Redeploy to pick up new posts.

To add a database-backed adapter, implement the `ContentRepository` interface and swap the factory — no page code changes required.

## Comments Setup

Tintero supports WordPress-parity guest comments backed by PostgreSQL. Comments are disabled by default until you connect a database.

### 1. Configure `site.yaml`

```yaml
comments:
  enabled: true        # site-wide toggle
  moderation: manual   # 'manual' (pending → CLI approve) or 'auto' (approved on submit)
```

### 2. Enable/disable per post

Add a `comments` frontmatter field to any post:

```markdown
---
title: My Post
date: 2025-01-15
comments: false    # disable comments for this post only (default: true)
---
```

### 3. Start a local database

```bash
docker compose up -d
```

This starts a PostgreSQL instance using the credentials in `.env.example`.

### 4. Set the connection string

```bash
cp .env.example .env.local
# Edit .env.local to set DATABASE_URL if using custom credentials
```

### 5. Push the schema

```bash
bunx drizzle-kit push
```

### 6. Moderate comments

```bash
# List pending comments
bun run mod list

# Approve a comment
bun run mod approve <comment-id>

# Mark as spam
bun run mod spam <comment-id>

# Delete a comment
bun run mod delete <comment-id>
```

Comment IDs are UUIDs visible in the `list` output.

### Build without a database

`bun run build` works without `DATABASE_URL` set. The post page uses Partial Prerendering (PPR): the post body is prerendered statically, and the comments island streams at request time. If the database is unreachable at runtime, the comments island shows a graceful fallback message.

## Content Admin

Tintero includes a web-based post editor at `/admin/posts` for creating, editing, and deleting posts directly from the browser.

### Writable filesystem requirement

The admin post editor (`/admin/posts`) requires a writable `content/posts/` directory at runtime. In serverless or read-only filesystem environments (e.g., Vercel Serverless Functions with ephemeral filesystems) this feature will not function — changes will not persist between requests. For persistent post editing in a serverless environment, you would need to mount a writable volume or use an external content backend.

### Usage

1. Sign in at `/admin/login`
2. Navigate to `/admin/posts`
3. Create, edit, or delete posts via the web UI
4. Changes are reflected on the public blog immediately (Next.js cache is invalidated on every mutation)

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

Please make sure tests pass before submitting:

```bash
bun test
bunx tsc --noEmit
bun run lint
bun run build
```

## License

[MIT](./LICENSE)
