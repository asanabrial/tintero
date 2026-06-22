interface ProseProps {
  html: string;
}

export function Prose({ html }: ProseProps) {
  return (
    <div
      className="prose prose-zinc dark:prose-invert max-w-none
        prose-headings:font-semibold prose-headings:tracking-tight
        prose-a:[color:var(--color-primary,#18181b)] dark:prose-a:[color:var(--color-primary,#fafafa)]
        prose-a:[text-decoration-color:var(--color-accent,currentColor)] prose-a:underline prose-a:underline-offset-4
        prose-code:rounded prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm
        prose-pre:bg-zinc-950 dark:prose-pre:bg-zinc-900 prose-pre:rounded-lg
        prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700
        prose-img:rounded-lg"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
