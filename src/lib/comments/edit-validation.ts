import { z } from "zod";

export const EditCommentBodySchema = z.object({
  body: z.string().trim().min(10, "Comment must be at least 10 characters.").max(5000, "Comment must be 5000 characters or fewer."),
});

export type EditCommentBody = z.infer<typeof EditCommentBodySchema>;
