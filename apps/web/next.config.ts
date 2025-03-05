/** @type {import('next').NextConfig} */

import path from "path";
import { existsSync } from "fs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = process.env.APP_ENV
  ? `.env.${process.env.APP_ENV}`
  : existsSync(path.join(__dirname, "env", ".env.development"))
    ? ".env.development"
    : ".env";
const envPath = path.join(__dirname, "env", envFile);
const defaultEnvPath = path.join(__dirname, "env", ".env");

console.log("Checking for env file:", envPath);

if (existsSync(envPath)) {
  console.log("Loading env file:", envPath);
  dotenv.config({ path: envPath });
} else if (existsSync(defaultEnvPath)) {
  console.log("Loading default .env file:", defaultEnvPath);
  dotenv.config({ path: defaultEnvPath });
} else {
  console.error(
    `No env file found. Checked:\n- ${envPath}\n- ${defaultEnvPath}`
  );
}

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

export default nextConfig;
