import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: {
    compilerOptions: {
      incremental: false,
    },
  },
  entry: ["src/server.ts"],
  format: ["esm"],
  sourcemap: true,
  target: "node20",
  // onSuccess: "node dist/server.js",
  splitting: true,
  treeshake: true,
  minify: true,
  noExternal: ["events"],
  // ignore: ["node_modules/**", "dist/**", ".turbo/**", ".git/**"],
  // watch: process.env.NODE_ENV === "development" && {
  // },
  // Optionally, you can also add these configurations
  platform: "node",
  bundle: true,
  // Ensure proper ESM output
  outDir: "dist",
  // Add Node.js built-in modules and other dependencies to external
  external: [
    // Node.js built-in modules
    "fs",
    "path",
    "os",
    "crypto",
    "events",
    "stream",
    "util",
    "url",
    "http",
    "https",
    "net",
    "tls",
    "zlib",
    "querystring",
    "buffer",
    "string_decoder",
    "tty",
    // External dependencies
    "express",
    "cors",
    "pino",
    "pino-http",
    "bull",
    "bullmq",
    "ioredis",
    "nodemailer",
    "@google-cloud/pubsub",
    "googleapis",
    "@prisma/client",
    "dotenv",
    "jsonwebtoken",
    "jwks-rsa",
    "luxon",
    "date-fns",
    "nanoid",
    "quoted-printable",
    "exponential-backoff",
  ],
});
