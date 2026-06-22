// DrizzleRevisionAdapter — implements RevisionRepository using an injected drizzle instance.
// No imports from pg, @electric-sql/pglite, React, or Next.js.

import { and, desc, eq } from "drizzle-orm";
import { postRevisions } from "./schema";
import type { Revision, RecordRevisionInput } from "./types";
import type { RevisionRepository } from "./ports";

// Accept the widest drizzle instance shape without coupling to a specific driver
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

/** Maps a DB row to a Revision domain object. */
function toRevision(row: {
  id: string;
  contentType: string;
  slug: string;
  rawContent: string;
  source: "admin" | "api" | "cli" | "wizard";
  authorId: string | null;
  authorLabel: string | null;
  sequence: number;
  createdAt: Date;
}): Revision {
  return {
    id: row.id,
    contentType: row.contentType,
    slug: row.slug,
    rawContent: row.rawContent,
    source: row.source,
    authorId: row.authorId,
    authorLabel: row.authorLabel,
    sequence: row.sequence,
    createdAt: row.createdAt,
  };
}

export class DrizzleRevisionAdapter implements RevisionRepository {
  constructor(private readonly db: DrizzleDb) {}

  async record(input: RecordRevisionInput): Promise<Revision> {
    const inserted = await this.db
      .insert(postRevisions)
      .values({
        contentType: input.contentType,
        slug: input.slug,
        rawContent: input.rawContent,
        source: input.source,
        authorId: input.authorId ?? null,
        authorLabel: input.authorLabel ?? null,
      })
      .returning();
    return toRevision(inserted[0]);
  }

  async listForSlug(contentType: string, slug: string): Promise<Revision[]> {
    const rows = await this.db
      .select()
      .from(postRevisions)
      .where(
        and(
          eq(postRevisions.contentType, contentType),
          eq(postRevisions.slug, slug)
        )
      )
      .orderBy(desc(postRevisions.createdAt), desc(postRevisions.sequence));
    return rows.map(toRevision);
  }

  async getById(id: string): Promise<Revision | null> {
    const rows = await this.db
      .select()
      .from(postRevisions)
      .where(eq(postRevisions.id, id));
    return rows.length > 0 ? toRevision(rows[0]) : null;
  }
}
