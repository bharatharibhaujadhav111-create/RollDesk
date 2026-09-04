import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: path.resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  ),
  transpilePackages: ["@workspace/api-client-react", "@workspace/api-zod"],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
};

export default nextConfig;
