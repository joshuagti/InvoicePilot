import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["imapflow", "mailparser", "pdf-parse", "pino", "pino-pretty"],
};

export default nextConfig;
