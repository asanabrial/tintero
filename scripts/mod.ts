#!/usr/bin/env bun
/**
 * CLI moderation tool for tintero comments.
 *
 * Usage (from repo root):
 *   bun run mod list [--status pending|approved|spam]
 *   bun run mod approve <id>
 *   bun run mod spam <id>
 *   bun run mod delete <id>
 *
 * Requires DATABASE_URL to be set.
 * Imports from src/lib/comments using relative paths (no @/ alias — not available outside Next.js).
 *
 * Runner: bun run scripts/mod.ts (or bun run mod)
 * Satisfies: REQ-CLI-01..05, REQ-MOD-06..09, S-23..27.
 */

import { getCommentRepository } from "../src/lib/comments/index";
import type { Comment } from "../src/lib/comments/types";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "…";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Print a table of comments to stdout.
 * Columns: id (8 chars), post_slug, author_name, created_at (date), body (80 chars)
 * Satisfies: REQ-CLI-03, S-23.
 */
function printTable(comments: Comment[]): void {
  if (comments.length === 0) {
    process.stdout.write("No comments found.\n");
    return;
  }

  const header = [
    "ID       ",
    "SLUG                 ",
    "AUTHOR               ",
    "DATE       ",
    "BODY",
  ].join("  ");

  process.stdout.write(header + "\n");
  process.stdout.write("─".repeat(120) + "\n");

  for (const c of comments) {
    const row = [
      c.id.slice(0, 8),
      truncate(c.postSlug, 20).padEnd(20),
      truncate(c.authorName, 20).padEnd(20),
      formatDate(c.createdAt).padEnd(10),
      truncate(c.body, 80),
    ].join("  ");
    process.stdout.write(row + "\n");
  }
}

// ────────────────────────────────────────────────────────────
// Commands
// ────────────────────────────────────────────────────────────

async function cmdList(args: string[]): Promise<void> {
  const statusFlagIdx = args.indexOf("--status");
  const status =
    statusFlagIdx !== -1 ? args[statusFlagIdx + 1] : "pending";

  const repo = getCommentRepository();

  if (status === "pending" || status === undefined) {
    const comments = await repo.listPending();
    printTable(comments);
    return;
  }

  if (status !== "approved" && status !== "spam" && status !== "pending") {
    printError(`Unknown status "${status}". Use: pending, approved, spam.`);
    process.exit(1);
  }

  // For approved/spam we use listPending() surrogate — adapter has listPending() only.
  // The spec only requires CLI list for pending (REQ-CLI-02 / REQ-MOD-09).
  // For approved/spam, fall back to an informative message.
  printError(
    `Listing by status="${status}" is not yet supported. Use the DB directly for approved/spam queries.`
  );
  process.exit(1);
}

async function cmdApprove(id: string): Promise<void> {
  if (!id) {
    printError("approve requires an <id> argument.");
    process.exit(1);
  }

  const repo = getCommentRepository();
  const result = await repo.approve(id);

  if (!result) {
    printError(`Comment ${id} not found.`);
    process.exit(1);
  }

  process.stdout.write(`Comment ${id} approved.\n`);
}

async function cmdSpam(id: string): Promise<void> {
  if (!id) {
    printError("spam requires an <id> argument.");
    process.exit(1);
  }

  const repo = getCommentRepository();
  const result = await repo.setSpam(id);

  if (!result) {
    printError(`Comment ${id} not found.`);
    process.exit(1);
  }

  process.stdout.write(`Comment ${id} marked as spam.\n`);
}

async function cmdDelete(id: string): Promise<void> {
  if (!id) {
    printError("delete requires an <id> argument.");
    process.exit(1);
  }

  const repo = getCommentRepository();
  const deleted = await repo.delete(id);

  if (!deleted) {
    printError(`Comment ${id} not found.`);
    process.exit(1);
  }

  process.stdout.write(`Comment ${id} deleted.\n`);
}

// ────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // argv: node scripts/mod.ts <command> [...args]
  const [, , command, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(
      "Usage:\n" +
        "  bun run mod list [--status pending|approved|spam]\n" +
        "  bun run mod approve <id>\n" +
        "  bun run mod spam <id>\n" +
        "  bun run mod delete <id>\n"
    );
    process.exit(0);
  }

  switch (command) {
    case "list":
      await cmdList(rest);
      break;
    case "approve":
      await cmdApprove(rest[0]);
      break;
    case "spam":
      await cmdSpam(rest[0]);
      break;
    case "delete":
      await cmdDelete(rest[0]);
      break;
    default:
      printError(`Unknown command "${command}". Use list, approve, spam, or delete.`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
