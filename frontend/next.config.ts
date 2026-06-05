import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend API URL is injected via NEXT_PUBLIC_API_URL environment variable.
  // Default: http://localhost:8000 for local development.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  },
};

export default nextConfig;
