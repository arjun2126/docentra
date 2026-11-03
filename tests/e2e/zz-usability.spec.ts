import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import pg from "pg";

/**
 * Q1-T4 usability coverage. This file sorts after the earlier specs, so it may
 * create its own fixtures without disturbing their deterministic assertions.
 * Every fixture row it creates is deleted in afterAll.
 */
const code = "E2E-UX";
const name = "Usability Fixture Vendor";
let vendorId: string | undefined;
let shno: string | undefined;

test.beforeAll(async () => {
  const receipt = JSON.parse(await readFile(process.env.DOCENTRA_E2E_RECEIPT!, "utf8"));
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const identity = (
      await db.query(
        "SELECT current_database() AS name, oid::text, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0];
    expect(identity).toEqual({ name: receipt.name, oid: receipt.oid, marker: receipt.marker });
    // Idempotent so a worker restart after an unrelated failure cannot collide.
    vendorId = (
      await db.query(
        "INSERT INTO docflow.vendor(code,name) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id::text",
        [code, name],
      )
    ).rows[0].id;
  } finally {
    await db.end();
  }
});

test.afterAll(async () => {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    if (vendorId) {
      // Approved documents are immutable by database constraint, so this spec
      // never forces their deletion. The dedicated E2E database is discarded
      // by the runner after the suite; non-immutable fixtures are removed.
      const approved = (
        await db.query(
          "SELECT count(*)::int AS n FROM docflow.document_header WHERE vendor_id=$1 AND status='approved'",
          [vendorId],
        )
      ).rows[0].n;
      if (approved === 0) {
        await db.query(
          "DELETE FROM docflow.document_detail WHERE shno IN (SELECT shno FROM docflow.document_header WHERE vendor_id=$1)",
          [vendorId],
        );
        await db.query("DELETE FROM docflow.document_header WHERE vendor_id=$1", [vendorId]);
        await db.query("DELETE FROM docflow.vendor WHERE id=$1", [vendorId]);
      } else {
        console.log("Keeping immutable approved fixtures in the disposable E2E database.");
      }
    }
  } finally {
    await db.end();
  }
});

test("document form reports inline errors, focuses the first field, and saves a draft", async ({ page }) => {
  await page.goto("/documents/new");

  // Submitting an empty form must explain every problem inline, not silently fail.
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Could not save. Check the marked fields below.");
  await expect(page.locator("#document-vendor")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#document-vendor")).toHaveAttribute("aria-describedby", "document-vendor-error");
  await expect(page.locator("#document-vendor-error")).toContainText("Choose a vendor");
  await expect(page.locator("#document-date")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#document-date-error")).toContainText("Use a valid date");
  const firstItem = page.locator('input[name="item"]').first();
  await expect(firstItem).toHaveAttribute("aria-invalid", "true");
  const itemDescription = await firstItem.getAttribute("aria-describedby");
  expect(itemDescription).toBeTruthy();
  await expect(page.locator(`#${itemDescription}`)).toContainText("Item is required");

  // Focus lands on the first invalid control so keyboard users are not stranded.
  await expect(page.locator("#document-vendor")).toBeFocused();

  // The vendor filter narrows the native, keyboard-operable select.
  await page.fill("#vendor-filter", "UX");
  await expect(page.getByRole("status")).toContainText("1 matching vendors");
  await page.selectOption("#document-vendor", { label: `${code} — ${name}` });
  await page.fill("#document-date", "2026-11-02");
  await firstItem.fill("Usability fixture item");
  await page.locator('input[name="quantity"]').first().fill("2");
  await page.locator('input[name="price"]').first().fill("3.25");
  await page.getByRole("button", { name: "Remove line 2", exact: true }).click();
  await page.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/documents\/\d+(\?saved=1)?$/);
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  await expect(page.locator("tbody").getByRole("cell", { name: "6.50" })).toBeVisible();
  shno = page.url().match(/\/documents\/(\d+)/)![1];
});

test("workflow transitions require confirmation, support Escape and focus trapping, and stay accurate", async ({ page }) => {
  expect(shno).toBeTruthy();
  const detailUrl = `/documents/${shno}`;
  await page.goto(detailUrl);
  await expect(page.getByText("draft", { exact: true })).toBeVisible();

  // Opening the dialog moves focus to Cancel and Tab cycles inside the modal.
  await page.getByRole("button", { name: "Submit for approval" }).click();
  let dialog = page.getByRole("dialog", { name: "Submit for approval", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("It will no longer be editable");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Confirm" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();

  // Escape cancels without changing status and returns focus to the trigger.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeFocused();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for approval" })).toBeVisible();

  // Explicit Cancel also leaves the document untouched.
  await page.getByRole("button", { name: "Submit for approval" }).click();
  dialog = page.getByRole("dialog", { name: "Submit for approval", exact: true });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();

  // Confirming performs the transition and reports the new state truthfully.
  await page.getByRole("button", { name: "Submit for approval" }).click();
  dialog = page.getByRole("dialog", { name: "Submit for approval", exact: true });
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Document is now submitted.");
  await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft" })).toHaveCount(0);

  // Approval is final and the confirmation states that plainly.
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Approve", exact: true });
  await expect(dialog).toContainText("Approval is final");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Document is now approved.");
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  await expect(page.getByText("This document is approved and can no longer be edited.")).toBeVisible();

  await page.goto(`${detailUrl}/edit`);
  await expect(page).toHaveURL(detailUrl);
});

test("vendor deactivation is confirmed, cancelable, and reversible", async ({ page }) => {
  expect(vendorId).toBeTruthy();
  await page.goto("/vendors");
  const row = page.locator("tbody tr").filter({ hasText: code });
  await expect(row).toContainText("Active");

  // Escape and Cancel both preserve the current availability.
  await row.getByRole("button", { name: "Deactivate" }).click();
  let dialog = page.getByRole("dialog", { name: "Deactivate", exact: true });
  await expect(dialog).toContainText("Existing document history stays intact");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Active");

  await row.getByRole("button", { name: "Deactivate" }).click();
  dialog = page.getByRole("dialog", { name: "Deactivate", exact: true });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("Active");

  await row.getByRole("button", { name: "Deactivate" }).click();
  dialog = page.getByRole("dialog", { name: "Deactivate", exact: true });
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Vendor deactivated");
  await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText("Inactive");

  await page.locator("tbody tr").filter({ hasText: code }).getByRole("button", { name: "Reactivate" }).click();
  dialog = page.getByRole("dialog", { name: "Reactivate", exact: true });
  await expect(dialog).toContainText("available for new documents again");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("status")).toContainText("Vendor reactivated");
  await expect(page.locator("tbody tr").filter({ hasText: code })).toContainText("Active");

  // Editing an active vendor and clearing Active also asks before saving.
  await page.goto(`/vendors?edit=${vendorId}`);
  await page.uncheck("#vendor-active");
  await page.getByRole("button", { name: "Save changes" }).click();
  dialog = page.getByRole("dialog", { name: "Save and deactivate vendor", exact: true });
  await expect(dialog).toContainText("deactivate it");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#vendor-active")).not.toBeChecked();
  await page.check("#vendor-active");
});

test("forms and confirmation dialogs do not create document-level horizontal overflow", async ({ page }) => {
  expect(vendorId).toBeTruthy();
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/documents/new", `/vendors?edit=${vendorId}`]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }

  // The modal itself must fit a narrow viewport and close without changing state.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/vendors");
  await page.locator("tbody tr").filter({ hasText: code }).getByRole("button", { name: "Deactivate" }).click();
  const dialog = page.getByRole("dialog", { name: "Deactivate", exact: true });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
