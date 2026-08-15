import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  turbopack: {
    root: fileURLToPath(new URL(".", import.meta.url)),
  },
};

export default withWorkflow(nextConfig);
