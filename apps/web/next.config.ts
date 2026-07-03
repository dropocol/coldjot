/** @type {import('next').NextConfig} */

// Importing env here guarantees the zod schema (apps/web/src/env.ts) runs at
// config-eval time — a missing required var fails the build immediately. The
// env files under apps/web/env/ are loaded by that module (Next's built-in
// .env auto-loading does not see the env/ subdirectory).
import "./src/env";

const nextConfig = {
  distDir: ".next",
  experimental: {
    serverActions: {
      allowedOrigins: ["[::1]:3000", "localhost:3000", "app.localhost:3000"],
    },
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  images: {
    remotePatterns: [
      // { hostname: "public.blob.vercel-storage.com" },
      // { hostname: "res.cloudinary.com" },
      // { hostname: "abs.twimg.com" },
      // { hostname: "pbs.twimg.com" },
      // { hostname: "avatar.vercel.sh" },
      // { hostname: "avatars.githubusercontent.com" },
      // { hostname: "www.google.com" },
      // { hostname: "flag.vercel.app" },
      // { hostname: "illustrations.popsy.co" },
      // { hostname: "*.public.blob.vercel-storage.com" },
      // { hostname: "images.pexels.com" },
      { hostname: "*" },
    ],
  },
};

module.exports = nextConfig;
