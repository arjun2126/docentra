import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { readPdf } from "../helpers/pdf-text";

const stamp = Date.now();
const vendorCode = `E2E-${stamp}`;
const vendorName = `Café Müller ${stamp}`;

test("a document can be created, approved, searched and exported", async ({ page }, testInfo) => {
  // 1. Create a vendor.
  await page.goto("/vendors");
  await page.fill("#vendor-code", vendorCode);
  await page.fill("#vendor-name", vendorName);
  await page.getByRole("button", { name: "Create vendor" }).click();
  await expect(page.getByRole("status")).toContainText("Vendor saved");

  // 2. Create a draft with two line items.
  await page.goto("/documents/new");
  await page.selectOption("#document-vendor", { label: `${vendorCode} — ${vendorName}` });
  await page.fill("#document-date", "2026-10-05");
  const items = page.locator('input[name="item"]');
  const quantities = page.locator('input[name="quantity"]');
  const prices = page.locator('input[name="price"]');
  const item = "Crème brûlée — Long catalogue description with specifications and a final marker FINISHED";
  await items.nth(0).fill(item);
  await quantities.nth(0).fill("2");
  await prices.nth(0).fill("10.50");
  await items.nth(1).fill("Toner");
  await quantities.nth(1).fill("3");
  await prices.nth(1).fill("1.25");
  await page.getByRole("button", { name: "Create draft" }).click();

  // 3. Server-computed totals, not client input.
  await expect(page).toHaveURL(/\/documents\/\d+$/);
  const number = (await page.locator("p.font-mono").first().innerText()).trim();
  expect(number).toMatch(/^DOC-\d{4}-\d{6}$/);
  await expect(page.getByText("24.75")).toBeVisible();

  // Draft replacement still supports editing, insertion and deletion.
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.locator('input[name="quantity"]').nth(0).fill("3");
  await page.getByRole("button", { name: "Remove line 2", exact: true }).click();
  await page.getByRole("button", { name: "Add line", exact: true }).click();
  await page.locator('input[name="item"]').nth(1).fill("Replacement toner");
  await page.locator('input[name="quantity"]').nth(1).fill("1");
  await page.locator('input[name="price"]').nth(1).fill("2.00");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/documents\/\d+$/);
  await expect(page.getByText("33.50")).toBeVisible();

  const detailUrl = page.url();
  for (const status of ["draft", "approved"]) {
    if (status === "approved") {
      await page.getByRole("button", { name: "Submit for approval" }).click();
      await expect(page.getByText("submitted", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(page.getByText("approved", { exact: true })).toBeVisible();
    }
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`${number}.pdf`);
    expect(await download.failure()).toBeNull();
    const path = testInfo.outputPath(`${status}.pdf`);
    await download.saveAs(path);
    await testInfo.attach(`${status} PDF`, { path, contentType: "application/pdf" });
    const { text, itemText } = await readPdf(await readFile(path));
    const normalized = text.replace(/\s+/g, " ");
    expect(itemText).toContain(item);
    for (const value of [vendorName, number, "2026-10-05", `Status: ${status}`,
      "3.0000", "10.50", "31.50", "Replacement toner", "1.0000", "2.00", "Total: 33.50"]) {
      expect(normalized).toContain(value);
    }
    await expect(page).toHaveURL(detailUrl);
  }

  await expect(page.getByText("This document is approved and can no longer be edited.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);

  // 5. An approved document cannot be reopened through the edit URL.
  await page.goto(`${detailUrl}/edit`);
  await expect(page).toHaveURL(detailUrl);

  // 6. Search finds it by document number.
  await page.goto(`/documents?q=${encodeURIComponent(number)}`);
  await expect(page.getByRole("link", { name: number })).toBeVisible();

});

test("invalid vendor input is rejected with an accessible message", async ({ page }) => {
  await page.goto("/vendors");
  await page.fill("#vendor-code", "x");
  await page.fill("#vendor-name", "A");
  await page.getByRole("button", { name: "Create vendor" }).click();

  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.locator("#vendor-code")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#vendor-code")).toHaveAttribute("aria-describedby", "vendor-code-error");
});

test("PDF errors stay on the document and allow retry without losing data", async ({ page }) => {
  await page.goto("/vendors");
  const code = `FONT-${stamp}`;
  await page.fill("#vendor-code", code);
  await page.fill("#vendor-name", "東京 Supply");
  await page.getByRole("button", { name: "Create vendor" }).click();
  await expect(page.getByRole("status")).toContainText("Vendor saved");
  await page.goto("/documents/new");
  await page.selectOption("#document-vendor", { label: `${code} — 東京 Supply` });
  await page.fill("#document-date", "2026-11-02");
  await page.locator('input[name="item"]').nth(0).fill("Paper");
  await page.locator('input[name="quantity"]').nth(0).fill("2");
  await page.locator('input[name="price"]').nth(0).fill("3.50");
  await page.getByRole("button", { name: "Remove line 2", exact: true }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/documents\/\d+$/);
  const url = page.url();
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("alert", { name: "PDF download error" })).toContainText("characters the export font cannot display");
  await expect(page).toHaveURL(url);
  await expect(page.getByText("東京 Supply", { exact: true })).toBeVisible();
  await expect(page.getByText("7.00").last()).toBeVisible();
  await page.route("**/api/documents/*/pdf", (route) => route.abort());
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("alert", { name: "PDF download error" })).toContainText("PDF download failed. Please try again.");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  await expect(page).toHaveURL(url);
});
