import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { WidgetsConfigSchema } from "./schema";
import type { Widget } from "./types";

export async function loadWidgetsConfig(
  filePath?: string
): Promise<{ "blog-sidebar": Widget[] }> {
  const resolvedPath =
    filePath ?? path.join(process.cwd(), "config", "widgets.yaml");

  let rawContent: string;
  try {
    rawContent = await fs.readFile(resolvedPath, "utf-8");
  } catch {
    return { "blog-sidebar": [] };
  }

  let rawData: unknown;
  try {
    rawData = parseYaml(rawContent);
  } catch {
    console.warn("[widgets] Failed to parse widgets.yaml, using empty config.");
    return { "blog-sidebar": [] };
  }

  const result = WidgetsConfigSchema.safeParse(rawData ?? {});
  if (!result.success) {
    console.warn("[widgets] widgets.yaml validation failed, using empty config.");
    return { "blog-sidebar": [] };
  }

  return result.data;
}
