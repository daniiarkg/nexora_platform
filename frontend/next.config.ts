import type { NextConfig } from "next";

const apiInternalURL = process.env.API_INTERNAL_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiInternalURL}/api/v1/:path*`,
      },
      {
        source: "/healthz",
        destination: `${apiInternalURL}/healthz`,
      },
      {
        source: "/logout",
        destination: `${apiInternalURL}/logout`,
      },
    ];
  },
};

export default nextConfig;
