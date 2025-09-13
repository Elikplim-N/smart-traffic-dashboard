import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // If hosting at https://<user>.github.io/<repo>, uncomment basePath:
  // basePath: "/smart-traffic-dashboard",
  // trailingSlash: true, // optional, helps with directory-style URLs
};

export default nextConfig;
