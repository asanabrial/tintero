// AuthSecretStep — server component. No client state.
// Blocks admin creation until AUTH_SECRET is set.

import { recheckAction } from "./actions";

export function AuthSecretStep() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Set AUTH_SECRET
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          AUTH_SECRET is required to sign session tokens. Generate one and add it to your environment.
        </p>
      </div>

      <ol className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
        <li className="space-y-1">
          <p className="font-medium">1. Generate a secret</p>
          <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-xs font-mono overflow-x-auto">
            <code>openssl rand -hex 32</code>
          </pre>
        </li>
        <li className="space-y-1">
          <p className="font-medium">2. Add it to <code className="font-mono text-xs">.env.local</code> and restart</p>
          <pre className="rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-xs font-mono overflow-x-auto">
            <code>AUTH_SECRET=&lt;your-generated-value&gt;</code>
          </pre>
        </li>
      </ol>

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
