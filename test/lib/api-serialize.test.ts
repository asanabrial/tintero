import { describe, expect, test } from "bun:test";
import {
  toPostJson,
  toPostJsonFull,
  toPageJson,
  toPageJsonFull,
  toPostListJson,
  toPageListJson,
  pickPostFrontmatter,
  pickPageFrontmatter,
  toCommentJson,
  toTagJson,
  toCategoryJson,
  toCommentListJson,
  toTagListJson,
  toCategoryListJson,
  toUserJson,
  toUserListJson,
} from "../../src/lib/api/serialize";
import type { Post, Page } from "../../src/lib/content/types";
import type { Comment, PublicComment } from "../../src/lib/comments/types";
import type { Tag, Category } from "../../src/lib/content/types";
import type { PublicUser } from "../../src/lib/auth/types";

// ============================================================
// Fixtures
// ============================================================

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: "my-post",
    title: "My Post",
    date: "2024-01-15",
    status: "published",
    tags: ["typescript", "react"],
    categories: ["tech"],
    excerpt: "A short excerpt.",
    html: "<p>Hello world</p>",
    comments: true,
    sticky: false,
    author: "Jane Doe",
    visibility: "public",
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    slug: "about",
    title: "About",
    date: "2024-01-01",
    status: "published",
    excerpt: "About the site.",
    html: "<p>About</p>",
    menuOrder: 0,
    ...overrides,
  };
}

const WHITELISTED_POST_KEYS = [
  "slug",
  "title",
  "date",
  "status",
  "tags",
  "categories",
  "excerpt",
  "author",
  "comments",
  "html",
] as const;

const WHITELISTED_PAGE_KEYS = ["slug", "title", "date", "excerpt", "html"] as const;

// ============================================================
// toPostJson — whitelist
// ============================================================

describe("toPostJson", () => {
  test("contains exactly the 10 whitelisted fields, no more", () => {
    const post = makePost();
    // Inject a rogue internal field (casting to get around TS)
    (post as unknown as Record<string, unknown>)._internalPath = "/data/posts/my-post.md";
    (post as unknown as Record<string, unknown>)._extra = "secret";

    const json = toPostJson(post);
    const keys = Object.keys(json);

    expect(keys).toHaveLength(10);
    for (const k of WHITELISTED_POST_KEYS) {
      expect(json).toHaveProperty(k);
    }
    expect(keys).not.toContain("_internalPath");
    expect(keys).not.toContain("_extra");
  });

  test("maps all field values correctly", () => {
    const post = makePost();
    const json = toPostJson(post);
    expect(json.slug).toBe("my-post");
    expect(json.title).toBe("My Post");
    expect(json.date).toBe("2024-01-15");
    expect(json.status).toBe("published");
    expect(json.tags).toEqual(["typescript", "react"]);
    expect(json.categories).toEqual(["tech"]);
    expect(json.excerpt).toBe("A short excerpt.");
    expect(json.html).toBe("<p>Hello world</p>");
    expect(json.comments).toBe(true);
    expect(json.author).toBe("Jane Doe");
  });

  test("is deterministic — same input yields deep equal output", () => {
    const post = makePost();
    const json1 = toPostJson(post);
    const json2 = toPostJson(post);
    expect(json1).toEqual(json2);
  });

  test("draft post maps status correctly", () => {
    const post = makePost({ status: "draft" });
    const json = toPostJson(post);
    expect(json.status).toBe("draft");
  });
});

// ============================================================
// toPostJsonFull — with raw
// ============================================================

describe("toPostJsonFull — with raw", () => {
  const raw = {
    frontmatter: {
      title: "My Post",
      date: "2024-01-15",
      status: "published",
      tags: ["typescript"],
      categories: ["tech"],
      comments: true,
      unknownKey: "should-be-dropped",
      anotherRogue: 42,
    } as Record<string, unknown>,
    rawData: {
      title: "My Post",
      date: "2024-01-15",
      status: "published",
      tags: ["typescript"],
      categories: ["tech"],
      comments: true,
      unknownKey: "should-be-dropped",
      anotherRogue: 42,
    } as Record<string, unknown>,
    body: "# Hello\n\nThis is the body.",
  };

  test("extends PostJson with raw (string body) and frontmatter", () => {
    const post = makePost();
    const full = toPostJsonFull(post, raw);

    // All PostJson fields still present
    for (const k of WHITELISTED_POST_KEYS) {
      expect(full).toHaveProperty(k);
    }

    // raw should be the body string
    expect(full.raw).toBe("# Hello\n\nThis is the body.");

    // frontmatter should be present
    expect(full.frontmatter).toBeDefined();
  });

  test("frontmatter picks only known keys — unknown keys dropped", () => {
    const post = makePost();
    const full = toPostJsonFull(post, raw);
    const fm = full.frontmatter!;

    // Known keys present
    expect(fm).toHaveProperty("title");
    expect(fm).toHaveProperty("date");
    expect(fm).toHaveProperty("status");
    expect(fm).toHaveProperty("tags");

    // Unknown keys dropped
    expect(fm).not.toHaveProperty("unknownKey");
    expect(fm).not.toHaveProperty("anotherRogue");
  });
});

// ============================================================
// toPostJsonFull — null raw (ADR-3 graceful degradation)
// ============================================================

describe("toPostJsonFull — null raw", () => {
  test("returns PostJson-shaped object WITHOUT raw or frontmatter keys", () => {
    const post = makePost();
    const full = toPostJsonFull(post, null);

    expect(full).not.toHaveProperty("raw");
    expect(full).not.toHaveProperty("frontmatter");

    // All PostJson fields still present
    for (const k of WHITELISTED_POST_KEYS) {
      expect(full).toHaveProperty(k);
    }
  });
});

// ============================================================
// toPostListJson
// ============================================================

describe("toPostListJson", () => {
  test("wraps posts array with meta fields", () => {
    const posts = [makePost(), makePost({ slug: "other-post" })];
    const meta = { total: 50, page: 3, pageSize: 10 };
    const result = toPostListJson(posts, meta);

    expect(result.total).toBe(50);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].slug).toBe("my-post");
    expect(result.posts[1].slug).toBe("other-post");
  });

  test("each post in list is serialized with whitelist only", () => {
    const post = makePost();
    (post as unknown as Record<string, unknown>)._secret = "leaked";
    const result = toPostListJson([post], { total: 1, page: 1, pageSize: 10 });
    expect(result.posts[0]).not.toHaveProperty("_secret");
  });
});

// ============================================================
// toPageJson — whitelist
// ============================================================

describe("toPageJson", () => {
  test("contains exactly the 5 whitelisted fields, no more", () => {
    const page = makePage();
    (page as unknown as Record<string, unknown>)._internalPath = "/data/pages/about.md";

    const json = toPageJson(page);
    const keys = Object.keys(json);

    expect(keys).toHaveLength(5);
    for (const k of WHITELISTED_PAGE_KEYS) {
      expect(json).toHaveProperty(k);
    }
    expect(keys).not.toContain("_internalPath");
  });

  test("maps all field values correctly", () => {
    const page = makePage();
    const json = toPageJson(page);
    expect(json.slug).toBe("about");
    expect(json.title).toBe("About");
    expect(json.date).toBe("2024-01-01");
    expect(json.excerpt).toBe("About the site.");
    expect(json.html).toBe("<p>About</p>");
  });
});

// ============================================================
// toPageJsonFull — with raw
// ============================================================

describe("toPageJsonFull — with raw", () => {
  const raw = {
    frontmatter: {
      title: "About",
      date: "2024-01-01",
      excerpt: "About the site.",
      unknownKey: "drop-me",
    } as Record<string, unknown>,
    rawData: {
      title: "About",
      date: "2024-01-01",
      excerpt: "About the site.",
      unknownKey: "drop-me",
    } as Record<string, unknown>,
    body: "# About\n\nThis is about.",
  };

  test("extends PageJson with raw and frontmatter; unknown keys dropped", () => {
    const page = makePage();
    const full = toPageJsonFull(page, raw);

    for (const k of WHITELISTED_PAGE_KEYS) {
      expect(full).toHaveProperty(k);
    }
    expect(full.raw).toBe("# About\n\nThis is about.");
    expect(full.frontmatter).toBeDefined();
    expect(full.frontmatter).not.toHaveProperty("unknownKey");
  });
});

// ============================================================
// toPageJsonFull — null raw
// ============================================================

describe("toPageJsonFull — null raw", () => {
  test("returns PageJson-shaped object without raw or frontmatter", () => {
    const page = makePage();
    const full = toPageJsonFull(page, null);

    expect(full).not.toHaveProperty("raw");
    expect(full).not.toHaveProperty("frontmatter");
    for (const k of WHITELISTED_PAGE_KEYS) {
      expect(full).toHaveProperty(k);
    }
  });
});

// ============================================================
// toPageListJson
// ============================================================

describe("toPageListJson", () => {
  test("wraps pages array with meta fields", () => {
    const pages = [makePage(), makePage({ slug: "contact" })];
    const result = toPageListJson(pages, { total: 2, page: 1, pageSize: 10 });

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.pages).toHaveLength(2);
  });
});

// ============================================================
// pickPostFrontmatter
// ============================================================

describe("pickPostFrontmatter", () => {
  test("drops unknown keys from raw data", () => {
    const raw = {
      title: "Test",
      date: "2024-01-15",
      status: "published",
      tags: ["ts"],
      categories: ["tech"],
      comments: true,
      secretField: "LEAKED",
      _internalId: 999,
    };

    const fm = pickPostFrontmatter(raw);
    expect(fm).toHaveProperty("title");
    expect(fm).toHaveProperty("date");
    expect(fm).toHaveProperty("status");
    expect(fm).toHaveProperty("tags");
    expect(fm).not.toHaveProperty("secretField");
    expect(fm).not.toHaveProperty("_internalId");
  });

  test("present known keys survive", () => {
    const raw = {
      title: "Test",
      date: "2024-06-01",
      status: "draft",
      tags: ["a", "b"],
      categories: ["cat"],
      excerpt: "An excerpt",
      slug: "test-slug",
      comments: false,
      author: "Bob",
    };
    const fm = pickPostFrontmatter(raw);
    expect(fm.title).toBe("Test");
    expect(fm.date).toBe("2024-06-01");
    expect(fm.status).toBe("draft");
    expect(fm.tags).toEqual(["a", "b"]);
    expect(fm.excerpt).toBe("An excerpt");
    expect(fm.comments).toBe(false);
    expect(fm.author).toBe("Bob");
  });
});

// ============================================================
// pickPageFrontmatter
// ============================================================

describe("pickPageFrontmatter", () => {
  test("drops unknown keys from raw data", () => {
    const raw = {
      title: "About",
      date: "2024-01-01",
      excerpt: "About page.",
      slug: "about",
      _hidden: true,
      rogue: "value",
    };
    const fm = pickPageFrontmatter(raw);
    expect(fm).toHaveProperty("title");
    expect(fm).toHaveProperty("date");
    expect(fm).not.toHaveProperty("_hidden");
    expect(fm).not.toHaveProperty("rogue");
  });

  test("known keys survive", () => {
    const raw = {
      title: "About",
      date: "2024-03-15",
      excerpt: "Short desc.",
      slug: "about",
    };
    const fm = pickPageFrontmatter(raw);
    expect(fm.title).toBe("About");
    expect(fm.date).toBe("2024-03-15");
    expect(fm.excerpt).toBe("Short desc.");
    expect(fm.slug).toBe("about");
  });
});

// ============================================================
// Fixtures for comments/tags/categories
// ============================================================

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    postSlug: "my-post",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorUrl: "https://alice.dev",
    body: "Great post!",
    status: "pending",
    parentId: null,
    createdAt: new Date("2024-06-01T12:00:00Z"),
    ...overrides,
  };
}

function makePublicComment(overrides: Partial<PublicComment> = {}): PublicComment {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    postSlug: "my-post",
    authorName: "Bob",
    authorUrl: null,
    body: "Nice!",
    status: "approved",
    parentId: null,
    createdAt: new Date("2024-06-02T08:00:00Z"),
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { slug: "javascript", label: "JavaScript", count: 5, ...overrides };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    slug: "tech/javascript",
    label: "JavaScript",
    count: 3,
    depth: 2,
    segments: ["tech", "javascript"],
    ...overrides,
  };
}

// ============================================================
// toCommentJson — MANDATORY security invariant
// ============================================================

describe("toCommentJson", () => {
  test("SECURITY: authorEmail is absent from output when input Comment has it", () => {
    const comment = makeComment({ authorEmail: "alice@example.com" });
    const result = toCommentJson(comment);
    // Mandatory assertion: key must not exist at all
    expect("authorEmail" in result).toBe(false);
    expect(JSON.stringify(result).includes("authorEmail")).toBe(false);
  });

  test("contains all whitelisted fields", () => {
    const comment = makeComment();
    const result = toCommentJson(comment);
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.postSlug).toBe("my-post");
    expect(result.authorName).toBe("Alice");
    expect(result.authorUrl).toBe("https://alice.dev");
    expect(result.body).toBe("Great post!");
    expect(result.status).toBe("pending");
    expect(result.parentId).toBeNull();
  });

  test("createdAt is ISO string", () => {
    const comment = makeComment({ createdAt: new Date("2024-06-01T12:00:00Z") });
    const result = toCommentJson(comment);
    expect(result.createdAt).toBe("2024-06-01T12:00:00.000Z");
    expect(typeof result.createdAt).toBe("string");
  });

  test("accepts PublicComment (no authorEmail field)", () => {
    const pub = makePublicComment();
    const result = toCommentJson(pub);
    expect("authorEmail" in result).toBe(false);
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(result.authorName).toBe("Bob");
    expect(result.authorUrl).toBeNull();
    expect(result.status).toBe("approved");
  });

  test("status field is present in output", () => {
    const comment = makeComment({ status: "approved" });
    const result = toCommentJson(comment);
    expect(result.status).toBe("approved");
  });
});

// ============================================================
// toTagJson
// ============================================================

describe("toTagJson", () => {
  test("maps slug, label, count correctly", () => {
    const tag = makeTag();
    const result = toTagJson(tag);
    expect(result.slug).toBe("javascript");
    expect(result.label).toBe("JavaScript");
    expect(result.count).toBe(5);
  });

  test("contains exactly 3 fields", () => {
    const tag = makeTag();
    const result = toTagJson(tag);
    expect(Object.keys(result)).toHaveLength(3);
  });
});

// ============================================================
// toCategoryJson
// ============================================================

describe("toCategoryJson", () => {
  test("maps all 5 fields correctly", () => {
    const cat = makeCategory();
    const result = toCategoryJson(cat);
    expect(result.slug).toBe("tech/javascript");
    expect(result.label).toBe("JavaScript");
    expect(result.count).toBe(3);
    expect(result.depth).toBe(2);
    expect(result.segments).toEqual(["tech", "javascript"]);
  });

  test("contains exactly 5 fields", () => {
    const cat = makeCategory();
    const result = toCategoryJson(cat);
    expect(Object.keys(result)).toHaveLength(5);
  });
});

// ============================================================
// toCommentListJson
// ============================================================

describe("toCommentListJson", () => {
  test("produces resource-named envelope {comments,total,page,pageSize}", () => {
    const comments = [makeComment(), makePublicComment()];
    const result = toCommentListJson(comments, { total: 2, page: 1, pageSize: 10 });
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(Array.isArray(result.comments)).toBe(true);
    expect(result.comments).toHaveLength(2);
    // Verify email absent from all items
    for (const item of result.comments) {
      expect("authorEmail" in item).toBe(false);
    }
  });
});

// ============================================================
// toTagListJson
// ============================================================

describe("toTagListJson", () => {
  test("produces resource-named envelope {tags,total,page,pageSize}", () => {
    const tags = [makeTag(), makeTag({ slug: "typescript", label: "TypeScript", count: 3 })];
    const result = toTagListJson(tags, { total: 2, page: 1, pageSize: 2 });
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags).toHaveLength(2);
  });
});

// ============================================================
// toCategoryListJson
// ============================================================

describe("toCategoryListJson", () => {
  test("produces resource-named envelope {categories,total,page,pageSize}", () => {
    const cats = [makeCategory(), makeCategory({ slug: "tech", depth: 1, segments: ["tech"] })];
    const result = toCategoryListJson(cats, { total: 2, page: 1, pageSize: 2 });
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
    expect(Array.isArray(result.categories)).toBe(true);
    expect(result.categories).toHaveLength(2);
    // Hierarchical entry has depth and segments
    const hierarchical = result.categories.find((c) => c.depth === 2);
    expect(hierarchical).toBeDefined();
    expect(hierarchical?.segments).toEqual(["tech", "javascript"]);
  });
});

// ============================================================
// Fixtures for users
// ============================================================

function makePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "user-uuid-1",
    email: "admin@example.com",
    role: "admin",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    name: null,
    bio: null,
    ...overrides,
  };
}

// ============================================================
// toUserJson — MANDATORY security invariant (REQ-5, R5.1, R5.3)
// ============================================================

describe("toUserJson", () => {
  test("SECURITY: passwordHash is NEVER in output — key must not exist", () => {
    const user = makePublicUser();
    const result = toUserJson(user);
    expect("passwordHash" in result).toBe(false);
    expect(JSON.stringify(result).includes("passwordHash")).toBe(false);
  });

  test("contains exactly the 4 whitelisted fields: id, email, role, createdAt", () => {
    const user = makePublicUser();
    const result = toUserJson(user);
    const keys = Object.keys(result);
    expect(keys).toHaveLength(4);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("email");
    expect(result).toHaveProperty("role");
    expect(result).toHaveProperty("createdAt");
  });

  test("maps field values correctly", () => {
    const user = makePublicUser({
      id: "abc-123",
      email: "test@example.com",
      role: "admin",
      createdAt: new Date("2024-06-15T10:30:00Z"),
    });
    const result = toUserJson(user);
    expect(result.id).toBe("abc-123");
    expect(result.email).toBe("test@example.com");
    expect(result.role).toBe("admin");
    expect(result.createdAt).toBe("2024-06-15T10:30:00.000Z");
  });

  test("createdAt is an ISO-8601 string", () => {
    const user = makePublicUser({ createdAt: new Date("2024-01-01T00:00:00Z") });
    const result = toUserJson(user);
    expect(typeof result.createdAt).toBe("string");
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  test("is deterministic — same input yields identical output", () => {
    const user = makePublicUser();
    expect(toUserJson(user)).toEqual(toUserJson(user));
  });
});

// ============================================================
// toUserListJson — envelope shape (REQ-9, R9.2)
// ============================================================

describe("toUserListJson", () => {
  test("produces resource-named envelope {users,total,page,pageSize}", () => {
    const users = [makePublicUser(), makePublicUser({ id: "user-uuid-2", email: "b@example.com" })];
    const result = toUserListJson(users, { total: 2, page: 1, pageSize: 2 });
    expect(Array.isArray(result.users)).toBe(true);
    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(2);
  });

  test("uses meta values verbatim (not recomputed from array length)", () => {
    const users = [makePublicUser()];
    const result = toUserListJson(users, { total: 100, page: 3, pageSize: 10 });
    expect(result.total).toBe(100);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.users).toHaveLength(1);
  });

  test("SECURITY: no user in list has passwordHash", () => {
    const users = [makePublicUser(), makePublicUser({ id: "u2", email: "c@example.com" })];
    const result = toUserListJson(users, { total: 2, page: 1, pageSize: 2 });
    for (const u of result.users) {
      expect("passwordHash" in u).toBe(false);
      expect(JSON.stringify(u).includes("passwordHash")).toBe(false);
    }
  });

  test("empty list returns users:[], total:0", () => {
    const result = toUserListJson([], { total: 0, page: 1, pageSize: 0 });
    expect(result.users).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
