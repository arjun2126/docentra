import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    // `--dir` narrows the scan; the pattern must stay root-relative so unit and
    // integration runs pick up their own files.
    include: ["**/*.test.ts"],
  },
});
