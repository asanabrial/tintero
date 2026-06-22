import type { MetadataRoute } from "next";
import { getLayoutSiteConfig } from "@/lib/content";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getLayoutSiteConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
