import type { NextConfig } from "next";

const isStaticExport = process.env.CUEASIDE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                {
                  key: "Permissions-Policy",
                  value: "camera=(), geolocation=(), microphone=()",
                },
              ],
            },
            {
              source: "/internal/:path*",
              headers: [
                {
                  key: "X-Robots-Tag",
                  value: "noindex, nofollow, noarchive",
                },
                { key: "Cache-Control", value: "private, no-store" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
