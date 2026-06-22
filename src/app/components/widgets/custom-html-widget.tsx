import { sanitizeWidgetHtml } from "@/lib/widgets/custom-html-sanitize";

interface CustomHtmlWidgetProps {
  title?: string;
  html: string;
}

export function CustomHtmlWidget({ title, html }: CustomHtmlWidgetProps) {
  const safeHtml = sanitizeWidgetHtml(html);
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      {title && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        </div>
      )}
      <div
        className="px-4 py-3 prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
}
