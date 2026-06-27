import { getRepository } from "@/lib/content";
import { getCommentRepository } from "@/lib/comments";
import type { Widget } from "@/lib/widgets/types";
import { buildArchiveBuckets } from "@/lib/widgets/build-archives";
import { RecentPostsWidget } from "./widgets/recent-posts-widget";
import { CategoriesWidget } from "./widgets/categories-widget";
import { TagCloudWidget } from "./widgets/tag-cloud-widget";
import { SearchWidget } from "./widgets/search-widget";
import { CustomHtmlWidget } from "./widgets/custom-html-widget";
import { PagesWidget } from "./widgets/pages-widget";
import { ArchivesWidget } from "./widgets/archives-widget";
import { RecentCommentsWidget } from "./widgets/recent-comments-widget";
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
  const needsPages = widgets.some((w) => w.type === "pages");
  const needsArchives = widgets.some((w) => w.type === "archives");
  const needsRecentComments = widgets.some((w) => w.type === "recent-comments");

  // Archives need the full post list to build buckets.
  // If recent-posts is also requested we already fetch posts; for archives
  // we always request a large pageSize so all posts are included.
  const needsPostsOrArchives = needsPosts || needsArchives;

  const repo = getRepository();
  const [siteConfig, postsResult, categories, tags, pagesResult, recentComments] =
    await Promise.all([
      repo.getSiteConfig(),
      needsPostsOrArchives
        ? repo.listPosts({ page: 1, pageSize: needsArchives ? 9999 : 20 })
        : Promise.resolve(null),
      needsCategories ? repo.listCategories() : Promise.resolve([]),
      needsTags ? repo.listTags() : Promise.resolve([]),
      needsPages ? repo.listPages({ pageSize: 9999 }) : Promise.resolve(null),
      needsRecentComments
        ? getCommentRepository().listRecentApproved(5)
        : Promise.resolve([]),
    ]);

  const allPosts = postsResult?.posts ?? [];
  const allPages = pagesResult?.pages ?? [];

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
              <SearchWidget key={index} title={title || t(loc, "common.search")} locale={loc} />
            );
          case "custom-html":
            return (
              <CustomHtmlWidget
                key={index}
                title={title || undefined}
                html={widget.html ?? ""}
              />
            );
          case "pages": {
            const count = widget.count ?? 5;
            const pages = allPages.slice(0, count).map((p) => ({
              slug: p.slug,
              title: p.title,
            }));
            return (
              <PagesWidget
                key={index}
                title={title || t(loc, "common.pages")}
                pages={pages}
                locale={loc}
              />
            );
          }
          case "archives": {
            const buckets = buildArchiveBuckets(allPosts);
            return (
              <ArchivesWidget
                key={index}
                title={title || t(loc, "common.archives")}
                buckets={buckets}
                locale={loc}
              />
            );
          }
          case "recent-comments": {
            const count = widget.count ?? 5;
            const comments = recentComments.slice(0, count);
            return (
              <RecentCommentsWidget
                key={index}
                title={title || t(loc, "common.recentComments")}
                comments={comments}
                locale={loc}
              />
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}
