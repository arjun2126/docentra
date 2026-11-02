import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

if (!process.env.DOCENTRA_E2E_RECEIPT) throw new Error("Use npm run test:e2e: direct Playwright invocation is unsafe");
const receipt = JSON.parse(readFileSync(process.env.DOCENTRA_E2E_RECEIPT, "utf8"));
if (!/^docentra_e2e_[a-z0-9_]{1,18}_[a-f0-9]{24}$/.test(receipt.name) ||
    process.env.DATABASE_URL !== receipt.url || !/^[a-f0-9]{48}$/.test(receipt.marker)) {
  throw new Error("Unsafe E2E launch receipt/environment");
}

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${process.env.E2E_ARTIFACT_DIR}/test-results`,
  use: {
    baseURL: receipt.baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
