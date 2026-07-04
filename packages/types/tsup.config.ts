import { defineConfig } from "tsup";

// https://github.com/vercel/turborepo/discussions/1347
export default defineConfig({
  clean: false,
  dts: {
    compilerOptions: {
      incremental: false,
      ignoreDeprecations: "6.0",
    },
  },
  entry: [
    "src/index.ts",
    "src/schemas.ts",
    "src/common.ts",
    "src/enums.ts",
    "src/user.ts",
    "src/contact.ts",
    "src/list.ts",
    "src/template.ts",
    "src/sequence.ts",
    "src/mailbox.ts",
    "src/gmail.ts",
    "src/email.ts",
    "src/events.ts",
    "src/thread.ts",
    "src/queue.ts",
    "src/search.ts",
    "src/watch.ts",
    "src/pubsub.ts",
    "src/placeholders.ts",
    "src/app-url.ts",
  ],
  format: ["esm", "cjs"],
  sourcemap: true,
  target: "node20",
});
