import { SearchForm } from "@/app/components/search-form";

interface SearchWidgetProps {
  title: string;
}

export function SearchWidget({ title }: SearchWidgetProps) {
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      </div>
      <div className="px-4 py-3">
        <SearchForm />
      </div>
    </section>
  );
}
