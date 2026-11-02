import { expect, test } from "@playwright/test";

const stamp = Date.now();
const vendorCode = `E2E-${stamp}`;
const vendorName = `E2E Supply ${stamp}`;

test("a document can be created, approved, searched and exported", async ({ page, request }) => {
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
  await items.nth(0).fill("A4 paper");
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

  // 4. Submit, then approve.
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("This document is approved and can no longer be edited.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);

  // 5. An approved document cannot be reopened through the edit URL.
  const detailUrl = page.url();
  await page.goto(`${detailUrl}/edit`);
  await expect(page).toHaveURL(detailUrl);

  // 6. Search finds it by document number.
  await page.goto(`/documents?q=${encodeURIComponent(number)}`);
  await expect(page.getByRole("link", { name: number })).toBeVisible();

  // 7. The PDF is generated on the server and is a real PDF.
  const shno = detailUrl.split("/").pop();
  const response = await request.get(`/api/documents/${shno}/pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.byteLength).toBeGreaterThan(500);
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
