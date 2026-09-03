import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir:
    process.env.NEXT_PHASE === "phase-development-server"
      ? ".next-dev"
      : ".next",
  outputFileTracingRoot: path.resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
  ),
  transpilePackages: ["@workspace/api-client-react", "@workspace/api-zod"],
};

export default nextConfig;
