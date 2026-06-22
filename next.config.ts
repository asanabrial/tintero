import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["calamo"],
  // Calamo lives as a sibling repo (H:/REPO/calamo). The directory junction in
  // node_modules/calamo points outside the default Turbopack root (the project
  // dir). Expanding root to the shared parent allows Turbopack to resolve the
  // calamo source files that the junction redirects to.
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  cacheComponents: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
