export type WidgetType = "recent-posts" | "categories" | "tag-cloud" | "search" | "custom-html";

export type Widget = {
  type: WidgetType;
  title?: string;
  count?: number;
  html?: string;
};

export type WidgetAreaConfig = Widget[];
