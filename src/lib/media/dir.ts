// Canonical uploads directory path for the Next.js runtime layer.
// Imported by route.ts and actions.ts — NOT by allowlist.ts or fs-media.ts
// (those take dir as a parameter for testability).

import * as path from "node:path";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");
