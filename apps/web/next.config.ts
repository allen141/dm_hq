import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_URL ?? "http://api:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@dm-hq/api-client"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
