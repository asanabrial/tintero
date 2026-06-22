// RevisionRepository port — the single interface the app layer depends on.
// ZERO imports from React, Next.js, pg, or @electric-sql/pglite.

import type { Revision, RecordRevisionInput } from "./types";

export interface RevisionRepository {
  /** Insert one revision row and return the saved row (with id, sequence, createdAt). */
  record(input: RecordRevisionInput): Promise<Revision>;

  /**
   * Return all revisions for the given (contentType, slug) pair,
   * ordered newest-first (createdAt DESC, sequence DESC as tiebreak).
   */
  listForSlug(contentType: string, slug: string): Promise<Revision[]>;

  /** Return the revision row by id, or null when not found. */
  getById(id: string): Promise<Revision | null>;
}
