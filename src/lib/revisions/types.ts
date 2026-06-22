// Revision domain types — no Next.js, React, or pg imports.

export interface Revision {
  id: string;
  contentType: string;
  slug: string;
  rawContent: string;
  source: "admin" | "api" | "cli" | "wizard";
  authorId: string | null;
  authorLabel: string | null;
  sequence: number;
  createdAt: Date;
}

export interface RevisionContext {
  source: "admin" | "api" | "cli" | "wizard";
  authorId?: string | null;
  authorLabel?: string | null;
}

export interface RecordRevisionInput {
  contentType: string;
  slug: string;
  rawContent: string;
  source: "admin" | "api" | "cli" | "wizard";
  authorId?: string | null;
  authorLabel?: string | null;
}
