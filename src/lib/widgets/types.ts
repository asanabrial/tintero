export type WidgetType =
  | "recent-posts"
  | "categories"
  | "tag-cloud"
  | "search"
  | "custom-html"
  | "pages"
  | "archives"
  | "recent-comments";

export type Widget = {
  type: WidgetType;
  title?: string;
  count?: number;
  html?: string;
};

export type WidgetAreaConfig = Widget[];
