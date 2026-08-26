import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source directly.
  transpilePackages: ["@postbox/ui", "@postbox/email-client"],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;