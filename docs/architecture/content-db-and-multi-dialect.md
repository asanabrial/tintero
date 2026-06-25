# Architecture Design: Content in DB + Multi-Dialect Support

**Status:** Decisions resolved — ready for implementation (§10)
**Change:** `content-db-and-multi-dialect`
**Author:** Architecture
**Scope:** One epic, two coupled goals — move content into the database for scale, and make the database dialect selectable at install.

> This is a DESIGN document. No code, no schema files, no migrations are written here. It exists to be reviewed and amended before any implementation starts. File paths and symbol names below were verified against the current codebase.

---

## 1. Context and problem

### 1.1 How content is stored today

All posts and pages are Markdown `.md` files on the filesystem, read through one adapter:

- The single port is `ContentRepository` in `src/lib/content/ports.ts` (10 read methods: `listPosts`, `getPost`, `listPages`, `getPage`, `listPostStatusCounts`, `listTags`, `listCategories`, `getSiteConfig`, `getLinkGraph`, `getUnlinkedMentions`).
- The only implementation is `FilesystemContentAdapter` (`src/lib/content/fs-adapter.ts`), constructed against `CONTENT_ROOT = process.cwd()/content` and wired in `src/lib/content/repository.ts` via `getAdapter()`.
- Write-side ports (`ContentWriter`, `PageWriter` in `ports.ts`) also currently resolve to the filesystem adapter family.
- Caching wraps the adapter in `repository.ts` using module-level `"use cache"` functions keyed on an **area fingerprint** (`postsFingerprint`, `pagesFingerprint`, `siteConfigFingerprint`, `taxonomiesFingerprint`). The fingerprint is an mtime/stat walk of the content directory.

The database (Drizzle + PostgreSQL) is used **only** for comments (`src/lib/comments/`), users (`src/lib/auth/schema.ts`), and revisions (`src/lib/revisions/schema.ts`). Content never touches the DB.

Taxonomy is also file/YAML-based:
- Categories are hierarchical via **slash-path encoding** inside the label string. `slugifyCategory("Tech/JavaScript")` in `src/lib/content/category.ts` splits on `/` into `["tech","javascript"]`; `joinSlug` rejoins to `tech/javascript`; `matchesCategory` does prefix matching. There is **no terms table and no real parent FK** — hierarchy lives entirely in the encoded string.
- Term descriptions live in `config/taxonomies.yaml`, merged at read time by `mergeTagIndex` / `mergeCategoryIndex` (`src/lib/content/taxonomy-registry.ts`).
- Term counts are recomputed by full-corpus scan in `FilesystemContentAdapter.listTags` / `listCategories`.

### 1.2 Why this cannot scale to millions of rows

The hotspots are structural, not tuning problems:

| Hotspot | Where | Why it breaks at scale |
| --- | --- | --- |
| Full-corpus load on every list | `fs-adapter.ts:167-301` (`listPosts`) | `collectMarkdownFiles` walks the whole tree, parses + `renderMarkdown` every file, then sorts in memory. O(N) per request. |
| OFFSET/slice pagination | `fs-adapter.ts:292-300` | `posts.slice(start, start+pageSize)` after loading everything. No keyset; cost grows with corpus, not page. |
| Single-post fetch scans the corpus | `fs-adapter.ts:303-347` (`getPost`) | Linear file scan to find one slug. `getPage` (`:438-441`) loads ALL pages with `pageSize: Number.MAX_SAFE_INTEGER` then `.find()`. |
| In-memory search | `applySearch` (`src/lib/content/search.ts`), called from `listPosts` | `.includes()`-style matching over fully-loaded bodies. Callers pass `pageSize: 9999` so nothing is truncated. |
| Term counts recomputed by scan | `fs-adapter.ts:474-510` | `listTags`/`listCategories` re-parse every post to rebuild the index each call. |
| WikiResolver double-scan | `fs-adapter.ts:526-548` (`getWikiResolver`) | Scans posts AND pages to build the `[[wikilink]]` resolver — invoked inside the render path of every list/get. |
| Link graph over whole corpus | `fs-adapter.ts:555-613` (`scanGraphInputs`) | Builds the full link graph and unlinked mentions by reading every body. |
| Global fingerprint cache invalidation | `repository.ts` + `fingerprint.ts` | One area fingerprint busts ALL posts at once. Any write invalidates the entire `posts` cache tag; no per-row granularity. |
| `generateStaticParams` over the corpus | `src/app/(site)/blog/[...slug]`, `pages/[slug]`, `sitemap.ts` | Enumerating millions of slugs at build is infeasible; `sitemap.ts` also exceeds the 50k-URL sitemap limit. |

The earlier proposal `sdd/indexed-content-adapter/proposal` (#1052) and the WP-parity audit (#1075) reached the same conclusion: **the FS storage model is THE scale blocker, and the multi-DB request only becomes meaningful once content lives in the DB.** This design supersedes the "index over files" approach with **content as the DB source of truth**, while keeping `.md` import/export.

---

## 2. Goals and non-goals

### 2.1 Goals

1. **Content in DB for scale.** Posts, pages, and taxonomy (including term descriptions) live in the database behind the existing `ContentRepository` port, so the platform scales to millions of rows with index-backed reads, keyset pagination, and per-row cache invalidation.
2. **Multi-dialect, selectable at install.** Support PostgreSQL (current), SQLite, MySQL, and MariaDB, chosen during installation.

### 2.2 Non-goals

- **NOT rebuilding the editor as block-based.** The Calamo Markdown editor stays. No block-JSON, no Gutenberg-style model.
- **NOT changing the Markdown format.** Posts, pages, and category/tag descriptions remain authored and **stored as raw Markdown** in a `TEXT` column. HTML is rendered at read time by the existing remark/rehype pipeline (`src/lib/content/markdown.ts`). Pre-rendered HTML is never the source of truth (it may be cached, never authoritative).
- **NOT shipping all four dialects in v1 if it complicates the first slice.** See the sequencing recommendation in §4.6 — recommend Postgres + SQLite first, MySQL/MariaDB in a later phase.
- **NOT redesigning revisions/auth/comments storage.** Those tables already exist; this epic aligns content writes to them but does not rebuild them.
- **NOT removing filesystem content support entirely.** The FS adapter is retained as an import/export and backfill source (§7).

---

## 3. Target DB schema

All bodies and term descriptions are `TEXT` columns holding raw Markdown. Types below are stated in the **lowest-common-denominator** policy from §4 (text UUID PKs, text/Zod instead of DB enums, portable timestamps). Per-dialect column builders differ; the logical shape does not.

### 3.1 `content` table — posts AND pages, one table with a `type` discriminator

**Recommendation: ONE table with a `type` discriminator (`'post' | 'page'`), not two tables.**

Justification:
- Posts and pages already share the overwhelming majority of fields (title, slug, status, body, excerpt, timestamps, SEO). The divergent fields are few: posts carry `tags`/`categories`/`visibility`/`password`/`sticky`/`comments`/`coverImage`/`author`; pages carry `parent`/`menu_order`. Nullable columns + the discriminator absorb this cleanly.
- The `getLinkGraph` / `getUnlinkedMentions` / wikilink resolver paths treat posts and pages **uniformly** (`scanGraphInputs` in `fs-adapter.ts` emits a `type` field already). A single table makes the cross-type slug lookup and link graph a single index scan instead of a union.
- One slug-uniqueness boundary is simpler than reconciling two. Slug uniqueness is scoped per `(type, slug)` — see §10 #5.
- Two tables would duplicate every index, every keyset query, and every adapter method.

Columns:

| Column | Type (logical) | Notes |
| --- | --- | --- |
| `id` | text PK | App-generated UUID (`crypto.randomUUID()`). See §4.3. |
| `type` | text | `'post'` or `'page'`. Validated by Zod, not a DB enum. |
| `slug` | text | Unique (see indexes). Replaces filesystem-derived slug. |
| `title` | text | |
| `status` | text | `'published' | 'draft'`. Zod-validated. |
| `visibility` | text | `'public' | 'private' | 'password'` (posts). Default `'public'`. |
| `password` | text NULL | Only meaningful when `visibility = 'password'`. |
| `body_markdown` | text | **Raw Markdown — source of truth.** Rendered at read time. |
| `excerpt` | text NULL | Manual excerpt; auto-excerpt derived at read time when null. |
| `cover_image` | text NULL | |
| `author_label` | text NULL | Display byline (frontmatter `author`). |
| `author_id` | text NULL | FK-ish reference to `users.id` (soft; users is its own module). |
| `sticky` | integer (0/1) | Portable boolean (§4.3). Posts only. |
| `comments_enabled` | integer (0/1) | Portable boolean (§4.3). |
| `parent_id` | text NULL | Self-FK for page hierarchy (replaces frontmatter `parent` slug). |
| `menu_order` | integer | Pages; default 0. |
| `published_at` | integer (epoch ms, UTC) | Portable timestamp (§4.3). Drives keyset + scheduled status. |
| `created_at` | integer (epoch ms, UTC) | Portable timestamp (§4.3). |
| `updated_at` | integer (epoch ms, UTC) | Portable timestamp (§4.3). Powers per-row cache tags. |

> SEO fields (`seo.title`, `metaDescription`, `focusKeyphrase`, `canonical`, `noindex`, `ogImage`, `cornerstone` — see `SeoFrontmatterSchema` in `src/lib/content/schema.ts`) are **NOT** columns here. They go in `content_meta` (§3.4). Rationale in §3.4 and §4.

### 3.2 `terms` table — taxonomy with a real `parent_id`

Replaces slash-path encoding (`category.ts`) and the YAML registry (`config/taxonomies.yaml`) for descriptions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | App-generated UUID. |
| `taxonomy` | text | `'category'` or `'tag'`. Zod-validated. |
| `slug` | text | Unique per taxonomy (single segment — NO more `tech/javascript` encoding). |
| `label` | text | Display name. |
| `parent_id` | text NULL | **Real self-FK** → `terms.id`. Hierarchy lives here, not in the slug. Tags keep `parent_id` NULL. |
| `description_markdown` | text NULL | **Term description as raw Markdown** (the constraint applies to terms too). Rendered at read time. |
| `count` | integer | **Cached count** of published content under this term. Maintained on write (incremental) and rebuildable. Replaces the per-call scan. |
| `created_at` / `updated_at` | portable timestamp | |

Hierarchy notes:
- The reader-facing `Category` type (`src/lib/content/types.ts`) still exposes `segments`, `slug` (slash-joined), `depth`. These become **derived projections** computed by walking `parent_id` at read time, not stored encodings. The port contract is preserved.
- "Descendant match" queries (current `matchesCategory`) use a **recursive CTE at read time** (Postgres/SQLite/MySQL8+/MariaDB10.2+ all support `WITH RECURSIVE`). No maintained closure/ancestor-path column in v1 — see §10 #6.

### 3.3 `term_relationships` table — content ↔ term join

| Column | Type | Notes |
| --- | --- | --- |
| `content_id` | text | FK → `content.id`. |
| `term_id` | text | FK → `terms.id`. |
| PK | (`content_id`, `term_id`) | Composite primary key prevents duplicates. |

Indexes both directions (§3.5): given a content row → its terms; given a term → its content (for tag/category archive listings).

### 3.4 `content_meta` table — WP-style key/value for SEO + extensible custom fields

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | App-generated UUID. |
| `content_id` | text | FK → `content.id`. |
| `meta_key` | text | e.g. `seo.focusKeyphrase`, `seo.canonical`. |
| `meta_value` | text NULL | Stored as text; typed at the app boundary via Zod. |

**EAV vs typed columns — decision: EAV (`content_meta`) for SEO and custom fields; typed columns only for the hot, always-queried content fields.**

Justification given multi-dialect portability:
- The natural alternative for structured SEO is a `jsonb` column. **`jsonb` is Postgres-only.** MySQL/MariaDB have `JSON` with different operators; SQLite has `JSON1` functions but a different surface. A `jsonb` design would force per-dialect query branches for every SEO read/write — exactly the drift we are trying to eliminate (§4).
- A wide typed-column approach (one column per SEO field) is portable but **rigid**: every new custom field is a migration across four dialects, and most rows leave most columns NULL. WordPress uses `postmeta` (EAV) precisely for this open-ended extensibility.
- EAV keeps the schema **identical across dialects** (just text columns), supports arbitrary future custom fields without migrations, and keeps SEO fields off the hot `content` row so list queries stay narrow.
- Cost: SEO reads are a second lookup (or a join) keyed by `content_id`. This is acceptable because SEO is needed on single-content render, not on list pages, and is index-backed.

This was the highest-leverage tradeoff in the schema; resolved in favor of EAV `content_meta` — see §10 #1.

### 3.5 Indexes needed for scale

| Index | Table | Purpose |
| --- | --- | --- |
| unique(`type`, `slug`) | `content` | O(log n) single-content fetch (replaces `getPost` linear scan). Scoped per type — §10 #5. |
| (`type`, `status`, `published_at` DESC, `id`) | `content` | The primary list/keyset index. Covers `listPosts`/`listPages` filtered by type+status, ordered for keyset pagination. |
| (`type`, `status`) partial/filtered | `content` | Status counts (`listPostStatusCounts`) via GROUP BY instead of scan. |
| (`parent_id`) | `content` | Page hierarchy lookups. |
| (`author_id`) | `content` | Author archive pages (replaces `pageSize:9999` + in-JS filter). |
| unique(`taxonomy`, `slug`) | `terms` | Term lookup by slug; uniqueness. |
| (`parent_id`) | `terms` | Hierarchy walk. |
| (`content_id`) | `term_relationships` | Content → terms. |
| (`term_id`) | `term_relationships` | Term → content (archive listings). |
| (`content_id`, `meta_key`) | `content_meta` | SEO/custom-field lookup per content. |

Full-text search indexes are dialect-specific and covered in §6.

---

## 4. Dialect-portability strategy (the hard part)

### 4.1 The core constraint

**Drizzle has NO dialect-neutral schema builder.** A table is declared with exactly one of `pgTable` (`drizzle-orm/pg-core`), `mysqlTable` (`drizzle-orm/mysql-core`), or `sqliteTable` (`drizzle-orm/sqlite-core`). The current schemas are hardwired to pg-core: `pgTable`, `pgEnum`, `uuid().defaultRandom()`, `serial`, `timestamp(... withTimezone)` in `comments/schema.ts`, `auth/schema.ts`, `revisions/schema.ts`. MariaDB rides on the MySQL core (wire-compatible).

### 4.2 Options for the schema layer

**Option (a): Per-dialect schema files + a dialect-selecting factory.**
- `content/schema.pg.ts`, `content/schema.sqlite.ts`, `content/schema.mysql.ts` (MariaDB reuses mysql). The factory (`content/factory.ts`) reads `DATABASE_DIALECT` and imports the matching schema + driver, exactly mirroring how `comments/factory.ts` lazily builds `drizzle(pool, { schema })` today.
- Pro: each file is idiomatic and type-checks against its own core; explicit; easy to read.
- Con: the table shape is repeated 3× (pg / sqlite / mysql). Drift risk between files.

**Option (b): A schema factory function.**
- A single `buildContentSchema(builders)` function parameterized by a small adapter of column builders (`pkText`, `tsCol`, `boolCol`, `tableFn`), invoked once per dialect.
- Pro: one logical definition; column/type decisions live in one place.
- Con: fights Drizzle's type system — the return types differ per core, so the function is effectively `any`-typed at the boundary (consistent with the project's `type DrizzleDb = any` convention, but loses some inference); generics get awkward; Drizzle Kit introspection/migrations prefer concrete per-dialect schema modules.

**Recommendation: Option (a) — per-dialect schema files + dialect-selecting factory — BUT minimize the drift cost with the lowest-common-denominator type policy below, and add a single shared "logical schema" descriptor (a plain TS object of column names + logical types) that a test asserts every per-dialect file conforms to.** This keeps Drizzle Kit happy (concrete schemas for migration generation), matches the existing factory convention, and the conformance test neutralizes the main downside of (a) (silent drift).

### 4.3 Lowest-common-denominator type policy (minimize per-dialect drift)

The fewer dialect-specific column behaviors we rely on, the smaller each per-dialect schema file's divergence. Policy:

| Concern | Current (pg) | Portable policy | Why |
| --- | --- | --- | --- |
| Primary keys | `uuid("id").defaultRandom()` / `serial` | **App-generated UUID stored as `text`** (`crypto.randomUUID()` at insert time) | `uuid` type and `defaultRandom()` are pg-specific; `serial` is pg auto-increment. A text UUID generated in app code is identical across all four dialects AND makes insert+SELECT deterministic (§5). |
| Enums | `pgEnum(...)` | **`text` column + Zod validation** at the boundary | `pgEnum` is Postgres-only; MySQL `ENUM` differs; SQLite has none. Zod (already the project's validation layer, see `schema.ts`) enforces the allowed set portably. |
| Timestamps | `timestamp(withTimezone)` / `defaultNow()` | **Epoch integer (ms, UTC)**, generated in app code; converted to `Date` at the boundary | `timestamptz` and `defaultNow()` semantics vary across dialects; a portable scalar removes the difference. **Resolved (was §10): epoch-int over ISO-text.** SQLite has no native date type (only `INTEGER`/`TEXT`/`REAL`), so epoch-int is the true common denominator — Drizzle's sqlite timestamp helper is sugar over an integer column anyway. Epoch-int also sorts/keysets cheapest (§6). The `date: z.string().date()` frontmatter is parsed to epoch at the migration boundary (§7). |
| Booleans | pg boolean | `integer` 0/1 | SQLite has no native boolean; integer 0/1 is universal. |
| Auto-increment sequence | `serial` (revisions `sequence`) | Avoid; if monotonic ordering is needed use `created_at` + `id` keyset, or a per-row computed sequence | `serial` is pg-only. |

Tradeoffs:
- App-generated UUID PKs are 36-char text (larger than a 4-byte serial). At millions of rows this costs index size and join width. Accepted: portability + deterministic insert+SELECT (§5) outweigh it; this matches the existing precedent (`revisions.authorId` is already `text`, comments use UUID PKs).
- Losing `pgEnum` means no DB-level enforcement of allowed values; Zod at the boundary is the single enforcement point. Acceptable — the project already treats Zod as the schema authority.
- Epoch-int timestamps lose `timestamptz` timezone semantics; the app already normalizes to a single timezone via `site.yaml` (`timezone` config), so this is not a regression. Values are stored as UTC milliseconds and wrapped in `Date` at the read boundary.

### 4.4 Note on the existing tables

`comments`, `users`, `post_revisions` are pg-hardwired today. This epic does **not** force-migrate them in v1, but for the multi-dialect goal to be real they must eventually follow the same policy (per-dialect schema files, text UUID PKs, text+Zod, portable timestamps). Recommended sequencing: bring **content** schema in under the policy first (greenfield, no data migration for those tables), then retrofit comments/auth/revisions in a follow-up once the per-dialect factory pattern is proven. Called out as a risk in §9.

### 4.5 The drizzle.config.ts problem

`drizzle.config.ts` today pins `dialect: "postgresql"` and a single schema array. Multi-dialect needs either per-dialect config files (`drizzle.pg.config.ts`, etc.) or a config that reads `DATABASE_DIALECT` and selects schema + dialect. Combined with the programmatic migration runner (§8), `drizzle-kit push` is replaced by generated migrations per dialect.

### 4.6 Sequencing recommendation

Ship **PostgreSQL + SQLite first** (both support `RETURNING`, both are the lowest-friction pair — Postgres is the incumbent, SQLite is a single-file zero-server target ideal for small installs and tests). Add **MySQL + MariaDB in a later phase** once the `RETURNING` abstraction (§5) and full-text abstraction (§6) are proven. This keeps v1 shippable without the hardest blocker (no-`RETURNING`) on the critical path.

---

## 5. The RETURNING blocker

### 5.1 The problem

PostgreSQL and SQLite support `INSERT ... RETURNING` / `UPDATE ... RETURNING`. **MySQL and MariaDB do NOT** (MariaDB has `INSERT ... RETURNING` since 10.5 but `UPDATE ... RETURNING` only from 10.5+ in limited forms; MySQL has none). The current adapters call `.returning()` on **every** write — see `DrizzleCommentAdapter.submit/approve/setSpam/setTrash/delete/updateBody/setPending` (`comments/drizzle-adapter.ts`), each ending in `.returning()`. A naive port to MySQL would fail on every write.

### 5.2 Proposed isolation

Introduce a small **write helper** in the persistence layer (e.g. `src/lib/db/returning.ts`) that the content adapter uses instead of calling `.returning()` directly:

- `insertReturning(db, table, values)`:
  - Postgres/SQLite path: `db.insert(table).values(values).returning()`.
  - MySQL/MariaDB path: `db.insert(table).values(values)` then `db.select().from(table).where(eq(table.id, values.id))` — i.e. **insert-then-SELECT by the known UUID**.
- `updateReturning(db, table, set, where, id)`: same split — RETURNING where supported, UPDATE + SELECT-by-id elsewhere.

The dialect is read once from the factory and bound into the helper, so the adapter code is dialect-agnostic.

### 5.3 Why app-generated UUIDs make this clean

Because PKs are generated in app code **before** the insert (§4.3), the MySQL path knows the row's `id` without needing a RETURNING value or `LAST_INSERT_ID()` (which only works for auto-increment and is connection-stateful/fragile). Insert + `SELECT ... WHERE id = <knownUuid>` is deterministic and race-free. This is the decisive reason to abandon `serial`/`uuid().defaultRandom()` in favor of app-generated text UUIDs.

---

## 6. Scale mechanics

| Concern | Today | Target |
| --- | --- | --- |
| Pagination | OFFSET/`Array.slice` over full corpus (`fs-adapter.ts:292-300`) | **Keyset/cursor pagination** on (`published_at` DESC, `id`). Cursor is the last row's `(published_at, id)`; query is `WHERE (published_at, id) < (cursor)`. O(page) not O(corpus). Admin UI keeps offset only on bounded, filtered result sets where editors expect jump-to-page (§10 #3). |
| Term counts | Recomputed scan per call (`listTags`/`listCategories`) | **Cached `terms.count`**, maintained incrementally on write, rebuildable by a reconcile job. |
| Cache invalidation | Global area fingerprint busts all `posts` (`repository.ts`) | **Per-row cache tags** (`post:{slug}`, `page:{slug}`) already exist for `getPost`/`getPage`; extend to writes so a single edit busts only that row + affected list/term tags. Replace the fingerprint stat-walk with `updated_at`-based or version-based keys. |
| Static params | `generateStaticParams` enumerates corpus; `sitemap.ts` uses MAX_SAFE_INTEGER loop | **On-demand rendering / ISR** — render content lazily on first request, cache with per-row tags. Sitemap becomes a **sitemap index + paginated 50k fragments** backed by keyset queries. |
| Wikilink resolution | Corpus double-scan (`getWikiResolver`) | **DB-backed resolver**: lookup by slug/title against the `content` table (indexed). The render path resolves `[[target]]` with a single indexed query instead of scanning every file. |
| Link graph / unlinked mentions | Whole-corpus scan (`scanGraphInputs`) | Bounded queries (N-hop neighborhood) and a search-backed mentions query rather than loading all bodies. (Heaviest caller; may stay a background/async job for very large corpora.) |
| Search | In-memory `.includes()` (`search.ts`), `pageSize:9999` | **Per-dialect full-text** behind an abstraction (below). |

### 6.1 Full-text search abstraction

Search is the most dialect-divergent feature. Propose a `ContentSearch` capability resolved by the factory per dialect, with a portable fallback:

| Dialect | Mechanism |
| --- | --- |
| PostgreSQL | `tsvector` column + GIN index; `to_tsquery`/`websearch_to_tsquery`. |
| MySQL / MariaDB | `FULLTEXT` index + `MATCH ... AGAINST`. |
| SQLite | `FTS5` virtual table. |
| Fallback (any) | Portable `LIKE`/`ILIKE`-equivalent `WHERE body_markdown LIKE '%term%'` — correctness-preserving, not scale-optimal; used only if a dialect's FTS is unavailable or as the v1 stopgap. |

The abstraction is a small interface (`search(query, opts): cursor-paginated results`) with one implementation per dialect; the adapter depends on the interface, not the SQL. Note `ilike` (used elsewhere) is also non-portable and must route through this layer or a portable case-insensitive comparison.

---

## 7. Migration plan (phased, FS → DB)

Each phase is independently shippable and reversible. The FS adapter remains the default until Phase 4.

**Phase 1 — DB content schema + `DrizzleContentAdapter` (behind config, FS still default).**
- Add per-dialect content schema files (Postgres + SQLite first per §4.6) and `DrizzleContentAdapter implements ContentRepository` (+ later the `ContentWriter`/`PageWriter` write ports).
- Wire adapter selection in `src/lib/content/repository.ts` via a `CONTENT_STORE` env flag (`fs` | `db`), defaulting to `fs`.
- Entry: schema reviewed; port contract unchanged. Exit: adapter passes the existing `ContentRepository` test suite against an empty/seeded DB; FS still serves production.

**Phase 2 — Idempotent backfill script `.md` → DB.**
- A CLI that reads via `FilesystemContentAdapter` (the existing parser is the oracle) and writes rows through `DrizzleContentAdapter`. Idempotent: upsert by slug; re-runnable; deterministic UUIDs optional (derive from slug) to make re-runs stable.
- Entry: Phase 1 adapter exists. Exit: backfill of a sample corpus produces row counts and field values matching the FS read for posts, pages, terms (incl. descriptions), and relationships.

**Phase 3 — Optional shadow / dual-read parity check.**
- A `CONTENT_STORE=shadow` mode reads from BOTH adapters and diffs results (FS = oracle), logging mismatches. Mirrors the shadow-read idea from #1052.
- Entry: backfill complete. Exit: zero diffs across the corpus for the 10 port methods over a representative request set → cutover green light.

**Phase 4 — Flip default to DB adapter; writes go to DB.**
- Default `CONTENT_STORE=db`. Reads and writes hit the DB. FS retained for export/backfill only.
- Entry: shadow parity green. Exit: production serving from DB; rollback = flip flag back to `fs` (data still on disk).

**Phase 5 — Admin/editor write paths + revisions alignment.**
- Admin create/update/delete/trash/restore flows write through `ContentWriter`/`PageWriter` DB implementations; revisions (`post_revisions`) recorded on DB writes consistent with today's `RevisionContext`.
- Entry: Phase 4 live. Exit: full editorial lifecycle (draft → publish → schedule → trash → restore) works end-to-end against the DB with revisions.

**Phase 6 — Install-time DB selection + programmatic migration runner + dialect-aware probes.**
- Add `DATABASE_DIALECT`, install wizard step, programmatic migrations per dialect (replacing manual `drizzle-kit push`), and dialect-specific error detection in probes. Add MySQL/MariaDB schema files here (deferred per §4.6).
- Entry: DB content live on Postgres+SQLite. Exit: a fresh install can choose any supported dialect and reach `complete` setup state.

---

## 8. Install-time DB selection

### 8.1 Configuration

- New env `DATABASE_DIALECT` ∈ `{postgresql, sqlite, mysql, mariadb}` (mariadb maps to the mysql driver/core).
- Connection input is dialect-shaped: **URL** for server DBs (`DATABASE_URL`, as today), **file path** for SQLite (`DATABASE_FILE`). The factory branches on `DATABASE_DIALECT` to construct the right driver (`node-postgres`, `mysql2`, `better-sqlite3`/`bun:sqlite`) — extending the lazy-singleton pattern in `comments/factory.ts`.

### 8.2 Wizard step

- The current `DatabaseStep` (`src/app/(site)/install/database-step.tsx`) hardcodes Postgres + `docker compose up -d`. Add a **dialect selector** before the connection instructions, and render dialect-specific guidance (SQLite: just a file path, no server; MySQL/MariaDB: server URL). The `recheckAction` flow stays.

### 8.3 Programmatic migrations

- Replace manual `drizzle-kit push` with a **programmatic migration runner** invoked from the install flow (and a CLI), applying the per-dialect generated migrations for the selected dialect. This removes the "run drizzle-kit by hand" step that the current `schema-step.tsx` implies.

### 8.4 Dialect-specific error detection

- `src/lib/install/probes.ts` currently keys "schema not ready" on **PG error code `42P01`** (`isUndefinedTable`, walking `.cause`). This is Postgres-specific. Generalize `isUndefinedTable` to recognize the equivalent per dialect:
  - Postgres: `42P01`.
  - MySQL/MariaDB: error `1146` (ER_NO_SUCH_TABLE).
  - SQLite: message `no such table` (SQLite surfaces text, not a stable numeric code).
- The `SetupState` machine (`db-unreachable | schema-not-ready | needs-admin | complete`) is unchanged; only the classifier becomes dialect-aware.

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Schema drift across per-dialect files (Option a) | Subtle behavioral differences, hard-to-find bugs | Single shared logical-schema descriptor + a conformance test asserting every per-dialect file matches column names/logical types (§4.2). |
| Full-text portability | Search behaves differently per dialect; FTS unavailable on some hosts | Capability interface with one impl per dialect + portable `LIKE` fallback (§6.1); document search semantics per dialect. |
| Backfill correctness / rollback | Data loss or silent field mismatch on import | Idempotent upsert by slug; shadow-read parity gate (Phase 3) before cutover; FS data retained as rollback source through Phase 4 (flip flag back to `fs`). |
| Cache strategy change | Stale or over-busting content after moving off the file fingerprint | Per-row tags already exist for `getPost`/`getPage`; extend to writes; replace fingerprint with `updated_at`/version key; verify with the existing cache tests. |
| `generateStaticParams` at scale | Build hangs / OOM enumerating millions of rows | Switch to on-demand/ISR; sitemap index + 50k fragments (§6). |
| Existing pg-hardwired tables (comments/auth/revisions) | Multi-dialect is incomplete until they are ported; `serial` in revisions has no portable equivalent | Sequence content first under the LCD policy; retrofit the other modules in a follow-up; replace `serial sequence` with keyset/computed ordering (§4.4). |
| No-`RETURNING` on MySQL/MariaDB | Every write would fail on a naive port | `insertReturning`/`updateReturning` helper with insert-then-SELECT-by-known-UUID (§5); MySQL/MariaDB deferred to Phase 6. |
| EAV read cost for SEO | Extra lookup/join per single-content render | SEO needed only on single-content render, not lists; index `(content_id, meta_key)`; revisit only if profiling shows a hot path. |

---

## 10. Resolved decisions

All open decisions were resolved by the owner ("aplica el más recomendable"). Each took the design-recommended option. These are now binding inputs to the Phase 1 task plan.

1. **SEO/custom-field storage → EAV `content_meta`.** Portable (no PG-only `jsonb`), extensible without per-dialect migrations, and keeps SEO off the hot `content` row. SEO metadata is read only on single-content render (never used for list filtering), so the classic EAV scale trap does not apply here. Indexed on `(content_id, meta_key)`. (§3.4)
2. **v1 dialect set → Postgres + SQLite.** Both support `RETURNING` natively, so v1 avoids the hardest blocker (§5). MySQL + MariaDB deferred to v2. (§4.6)
3. **Pagination → keyset/cursor as the default everywhere** (public listings, APIs, sitemap). The admin list MAY retain OFFSET numbered pages **only** on bounded, filtered result sets (status/type/search), where editors expect jump-to-page and the row count is already small. (§6)
4. **Timestamps → epoch integer (ms, UTC), single portable column.** SQLite has no native date type, so epoch-int is the true common denominator; chosen over ISO-text and over per-dialect native types. App converts to `Date` at the boundary. (§4.3)
5. **Slug uniqueness → unique per `(type, slug)`.** Matches WordPress per-post-type uniqueness and the separate `/blog/{slug}` vs `/{slug}` route namespaces. Preserves the single-table discriminator design. (§3.1)
6. **Category descendant queries → recursive CTE at read time.** All target dialects support `WITH RECURSIVE`. No write-time closure/ancestor-path maintenance in v1: the terms tree stays small (shallow, thousands of rows) even when content is huge, and the hot aggregate is already covered by the cached `terms.count` column. Revisit a closure column only if profiling shows it hot. (§3.2)
7. **Single `content` table with a `type` discriminator** (confirmed) over split `posts`/`pages` tables. (§3.1)
