import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  ),
  transpilePackages: ["@workspace/api-client-react", "@workspace/api-zod"],
  async rewrites() {
    const apiServerUrl =
      process.env.API_SERVER_URL ??
      (process.env.NODE_ENV === "development" ? "http://localhost:8080" : null);

    if (!apiServerUrl) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiServerUrl.replace(/\/$/, "")}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
