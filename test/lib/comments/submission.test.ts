/**
 * Unit tests for processSubmission — the pure core of the submitComment server action.
 * Covers: S-10 (honeypot), S-11 (min-time), S-15 (per-post disabled), S-16 (site-wide disabled),
 * moderation auto→approved, moderation manual→pending,
 * CommentDepthError subclass routing, Zod field errors, trim passthrough.
 *
 * No Next.js imports, no pg, no PGlite — pure function with dependency injection.
 */

import { describe, expect, mock, test } from "bun:test";
import { CommentDepthError, CommentNotFoundError, CommentUnapprovedError } from "../../../src/lib/comments/types";
import type { CommentRepository } from "../../../src/lib/comments/ports";
import type { CommentsConfig } from "../../../src/lib/content/types";
import { processSubmission } from "../../../src/lib/comments/submission";
import type { SubmissionInput } from "../../../src/lib/comments/submission";

// ────────────────────────────────────────────────────────────────────────────────
// Shared fixtures
// ────────────────────────────────────────────────────────────────────────────────

const VALID_INPUT: SubmissionInput = {
  honeypot: "",
  formStartedAt: new Date(Date.now() - 5000).toISOString(), // 5s ago → passes min-time
  rawData: {
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorUrl: "",
    body: "This is a valid comment body.",
    parentId: undefined,
    postSlug: "hello-world",
  },
};

const AUTO_CONFIG: CommentsConfig = { enabled: true, moderation: "auto" };
const MANUAL_CONFIG: CommentsConfig = { enabled: true, moderation: "manual" };
const DISABLED_SITE_CONFIG: CommentsConfig = { enabled: false, moderation: "manual" };

function makeStubRepo(submitImpl?: () => Promise<unknown>): CommentRepository {
  return {
    submit: mock(submitImpl ?? (() => Promise.resolve({
      id: "abc-123",
      postSlug: "hello-world",
      authorName: "Alice",
      authorEmail: "alice@example.com",
      authorUrl: null,
      body: "This is a valid comment body.",
      status: "approved" as const,
      parentId: null,
      createdAt: new Date(),
    }))),
    listApproved: mock(() => Promise.resolve([])),
    countApproved: mock(() => Promise.resolve(0)),
    countApprovedBySlugs: mock(() => Promise.resolve({})),
    listPending: mock(() => Promise.resolve([])),
    approve: mock(() => Promise.resolve(null)),
    setSpam: mock(() => Promise.resolve(null)),
    delete: mock(() => Promise.resolve(false)),
  } as unknown as CommentRepository;
}

// ────────────────────────────────────────────────────────────────────────────────
// S-10: Honeypot filled → fake success, repo.submit NOT called
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — honeypot (S-10)", () => {
  test("honeypot filled: returns success shape without calling repo.submit", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      { ...VALID_INPUT, honeypot: "http://spam.example.com" },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
    // repo.submit must NOT have been called
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test("honeypot filled: response is indistinguishable from real success (has pending field)", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      { ...VALID_INPUT, honeypot: "bot-content" },
      { repo, config: MANUAL_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
    expect("pending" in result).toBe(true);
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// S-11: Min-time < 3s → error
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — min-time (S-11)", () => {
  test("submit within 1 second: returns error, repo.submit NOT called", async () => {
    const repo = makeStubRepo();
    const startedAt = new Date(Date.now() - 1000).toISOString(); // 1s ago

    const result = await processSubmission(
      { ...VALID_INPUT, honeypot: "", formStartedAt: startedAt },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toContain("too fast");
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test("submit after exactly 3 seconds: succeeds (boundary — elapsed >= 3000)", async () => {
    const repo = makeStubRepo();
    const formStartedAt = new Date(Date.now() - 3001).toISOString(); // 3001ms ago

    const result = await processSubmission(
      { ...VALID_INPUT, honeypot: "", formStartedAt },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// S-15: Per-post comments disabled → error, repo.submit NOT called
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — per-post disabled (S-15)", () => {
  test("post has comments: false → returns error even with valid input", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: MANUAL_CONFIG, postCommentsEnabled: false, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toContain("disabled");
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test("postCommentsEnabled: true → proceeds normally (submit called)", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// S-16: Site-wide comments disabled → error, repo.submit NOT called
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — site-wide disabled (S-16)", () => {
  test("siteConfig.comments.enabled: false → returns error", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: DISABLED_SITE_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toContain("disabled");
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test("both site-disabled AND post-disabled: still returns error (not doubled)", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: DISABLED_SITE_CONFIG, postCommentsEnabled: false, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Moderation: auto → approved, manual → pending
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — moderation", () => {
  test("moderation=auto: repo.submit called with status=approved, returns pending:false", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
    expect((result as { pending?: boolean }).pending).toBe(false);

    const calls = (repo.submit as ReturnType<typeof mock>).mock.calls as unknown[][];
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe("approved"); // second arg is status
  });

  test("moderation=manual: repo.submit called with status=pending, returns pending:true", async () => {
    const submitMock = mock(() => Promise.resolve({
      id: "def-456",
      postSlug: "hello-world",
      authorName: "Alice",
      authorEmail: "alice@example.com",
      authorUrl: null,
      body: "This is a valid comment body.",
      status: "pending" as const,
      parentId: null,
      createdAt: new Date(),
    }));
    const repo = { ...makeStubRepo(), submit: submitMock } as unknown as CommentRepository;

    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: MANUAL_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("success");
    expect((result as { pending?: boolean }).pending).toBe(true);
    expect((submitMock.mock.calls as unknown[][])[0][1]).toBe("pending");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// CommentDepthError subclass routing (SG-02)
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — depth error routing via instanceof", () => {
  test("CommentNotFoundError → message: does not exist", async () => {
    const repo = makeStubRepo(async () => {
      throw new CommentNotFoundError("The comment you are replying to does not exist.");
    });

    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toBe(
      "The comment you are replying to does not exist."
    );
  });

  test("CommentUnapprovedError → message: not available", async () => {
    const repo = makeStubRepo(async () => {
      throw new CommentUnapprovedError("The comment you are replying to is not available.");
    });

    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toBe(
      "The comment you are replying to is not available."
    );
  });

  test("CommentDepthError (depth violation) → message: replies to replies not allowed", async () => {
    const repo = makeStubRepo(async () => {
      throw new CommentDepthError("Replies to replies are not allowed.");
    });

    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toBe(
      "Replies to replies are not allowed."
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Zod validation → fieldErrors
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — Zod validation errors", () => {
  test("empty authorName after trim → fieldErrors.authorName", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      {
        ...VALID_INPUT,
        rawData: { ...VALID_INPUT.rawData, authorName: "   " },
      },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    const fe = (result as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    expect(fe).toBeDefined();
    expect(fe!.authorName).toBeDefined();
    expect(fe!.authorName.length).toBeGreaterThan(0);
    expect((repo.submit as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test("body too short → fieldErrors.body", async () => {
    const repo = makeStubRepo();
    const result = await processSubmission(
      {
        ...VALID_INPUT,
        rawData: { ...VALID_INPUT.rawData, body: "Hi" },
      },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    const fe = (result as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    expect(fe).toBeDefined();
    expect(fe!.body).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Generic DB error → error state (never throws)
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — generic error handling", () => {
  test("unexpected DB error → returns error state, does not throw", async () => {
    const repo = makeStubRepo(async () => {
      throw new Error("Connection refused");
    });

    const result = await processSubmission(
      VALID_INPUT,
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    expect(result.status).toBe("error");
    expect((result as { message?: string }).message).toContain("Failed to save");
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// Trim behavior passthrough
// ────────────────────────────────────────────────────────────────────────────────

describe("processSubmission — trim passthrough", () => {
  test("whitespace-padded authorName is trimmed before reaching repo", async () => {
    const repo = makeStubRepo();
    await processSubmission(
      {
        ...VALID_INPUT,
        rawData: { ...VALID_INPUT.rawData, authorName: "  Alice  " },
      },
      { repo, config: AUTO_CONFIG, postCommentsEnabled: true, now: Date.now }
    );

    const calls = (repo.submit as ReturnType<typeof mock>).mock.calls as unknown[][];
    expect(calls.length).toBe(1);
    expect((calls[0][0] as { authorName: string }).authorName).toBe("Alice");
  });
});
