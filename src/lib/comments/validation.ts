import { z } from "zod";

/**
 * Zod schema for validating a comment submission at the server action boundary.
 * - All string fields are trimmed before length checks.
 * - authorUrl: empty string is treated as absent (undefined).
 * - Unknown fields are stripped (default .strip() behavior).
 */
export const CommentSubmissionSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),

  authorEmail: z
    .string()
    .trim()
    .email("A valid email address is required.")
    .max(254, "Email must be 254 characters or fewer."),

  authorUrl: z
    .string()
    .trim()
    .max(2048, "URL must be 2048 characters or fewer.")
    .url("Author URL must be a valid URL.")
    .optional()
    .or(z.literal("").transform(() => undefined))
    .optional(),

  body: z
    .string()
    .trim()
    .min(10, "Comment must be at least 10 characters.")
    .max(5000, "Comment must be 5000 characters or fewer."),

  parentId: z.string().uuid("parentId must be a valid UUID.").nullable().optional(),
});

export type CommentSubmission = z.infer<typeof CommentSubmissionSchema>;
