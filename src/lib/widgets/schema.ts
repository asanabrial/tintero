import { z } from "zod";
import type { Widget, WidgetAreaConfig } from "./types";

export const WidgetSchema = z.object({
  type: z.enum([
    "recent-posts",
    "categories",
    "tag-cloud",
    "search",
    "custom-html",
    "pages",
    "archives",
    "recent-comments",
  ]),
  title: z.string().optional(),
  count: z.number().int().positive().optional(),
  html: z.string().optional(),
});

export const WidgetsConfigSchema = z.object({
  "blog-sidebar": z
    .array(z.unknown())
    .transform((arr) =>
      arr.flatMap((item) => {
        const parsed = WidgetSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    )
    .default([]),
});

export type { Widget, WidgetAreaConfig };
