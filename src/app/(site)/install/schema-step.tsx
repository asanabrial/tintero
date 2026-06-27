// SchemaStep — server component. No client state.
// Instructs the operator to push the Drizzle schema.

import { recheckAction } from "./actions";
import { contentSchemaPushCommand } from "@/lib/install/content-schema-command";

export function SchemaStep() {
  const contentCmd = contentSchemaPushCommand(
    process.env.CONTENT_STORE,
    process.env.DATABASE_DIALECT
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Apply schema
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The database is reachable but the schema has not been applied yet.
        </p>
      </div>

      <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <p className="font-medium">Run the following command to push the schema:</p>
        <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-xs font-mono overflow-x-auto">
          <code>bunx drizzle-kit push</code>
        </pre>
      </div>

      {contentCmd !== null && (
        <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <p className="font-medium">Content tables (DB content store)</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Only needed when <code className="font-mono">CONTENT_STORE=db</code>.
          </p>
          <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-xs font-mono overflow-x-auto">
            <code>{contentCmd}</code>
          </pre>
        </div>
      )}

      <form action={recheckAction}>
        <button
          type="submit"
          className="w-full rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 transition-colors"
        >
          Re-check
        </button>
      </form>
    </div>
  );
}
