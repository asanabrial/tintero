import { getRepository } from "@/lib/content";
import type { Widget } from "@/lib/widgets/types";
import { RecentPostsWidget } from "./widgets/recent-posts-widget";
import { CategoriesWidget } from "./widgets/categories-widget";
import { TagCloudWidget } from "./widgets/tag-cloud-widget";
import { SearchWidget } from "./widgets/search-widget";
import { CustomHtmlWidget } from "./widgets/custom-html-widget";
import { t } from "@/lib/i18n";

interface WidgetAreaProps {
  widgets: Widget[];
  locale?: string;
}

export async function WidgetArea({ widgets, locale }: WidgetAreaProps) {
  const loc = locale ?? "en";
  if (widgets.length === 0) return null;

  const needsPosts = widgets.some((w) => w.type === "recent-posts");
  const needsCategories = widgets.some((w) => w.type === "categories");
  const needsTags = widgets.some((w) => w.type === "tag-cloud");

  const repo = getRepository();
  const [siteConfig, postsResult, categories, tags] = await Promise.all([
    repo.getSiteConfig(),
    needsPosts ? repo.listPosts({ page: 1, pageSize: 20 }) : Promise.resolve(null),
    needsCategories ? repo.listCategories() : Promise.resolve([]),
    needsTags ? repo.listTags() : Promise.resolve([]),
  ]);

  const allPosts = postsResult?.posts ?? [];

  return (
    <div className="space-y-6">
      {widgets.map((widget, index) => {
        const title = widget.title ?? "";
        switch (widget.type) {
          case "recent-posts": {
            const count = widget.count ?? 5;
            const posts = allPosts.slice(0, count).map((p) => ({
              slug: p.slug,
              title: p.title,
              date: p.date,
            }));
            return (
              <RecentPostsWidget
                key={index}
                title={title || t(loc, "common.recentPostsTitle")}
                posts={posts}
                locale={loc}
                structure={siteConfig.permalinks?.structure ?? "plain"}
              />
            );
          }
          case "categories":
            return (
              <CategoriesWidget
                key={index}
                title={title || t(loc, "common.categories")}
                categories={categories}
                locale={loc}
              />
            );
          case "tag-cloud":
            return (
              <TagCloudWidget key={index} title={title || t(loc, "common.tags")} tags={tags} locale={loc} />
            );
          case "search":
            return (
              <SearchWidget key={index} title={title || t(loc, "common.search")} />
            );
          case "custom-html":
            return (
              <CustomHtmlWidget
                key={index}
                title={title || undefined}
                html={widget.html ?? ""}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
