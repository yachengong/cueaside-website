import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.CUEASIDE_STATIC_EXPORT === "1" ? "export" : undefined,
  trailingSlash: true,
};

export default nextConfig;
