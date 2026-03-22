import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/.git/**",
          "**/.next/**",
          "**/.venv/**",
          "**/node_modules/**",
          "**/Loupe-UX/**",
          "**/backend/exports/**",
        ],
      };
    }

    return config;
  },
};

export default nextConfig;
