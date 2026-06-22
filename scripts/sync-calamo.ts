/**
 * sync-calamo.ts
 *
 * Bun's file: dependency creates individual file symlinks in node_modules,
 * which Turbopack on Windows cannot follow (Rust limitation — individual file
 * symbolic links are treated as redirects and fail to parse as JSON).
 *
 * This postinstall script replaces those symlinks with a Windows directory
 * junction (mklink /J), which is transparent to all Win32 readers including
 * Turbopack's Rust resolver.
 *
 * Run automatically via postinstall, or manually:
 *   bun run scripts/sync-calamo.ts
 */
import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { join, resolve } from "path";

const projectRoot = resolve(import.meta.dir, "..");
const dest = join(projectRoot, "node_modules", "calamo");
const calamoRoot = resolve(projectRoot, "..", "calamo");

if (!existsSync(calamoRoot)) {
  console.error(`[sync-calamo] ERROR: calamo repo not found at ${calamoRoot}`);
  process.exit(1);
}

// Remove the symlink-based directory bun install creates
if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true });
}

// Create a Windows junction (transparent reparse point, readable by Turbopack)
execSync(`cmd /c "mklink /J "${dest}" "${calamoRoot}""`, { stdio: "inherit" });

console.log(`[sync-calamo] Junction created: node_modules/calamo -> ${calamoRoot}`);
