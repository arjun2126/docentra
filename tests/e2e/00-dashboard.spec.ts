import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

test("dashboard presentation with deterministic empty and populated data", async ({ page }, testInfo) => {
  const receipt = JSON.parse(await readFile(process.env.DOCENTRA_E2E_RECEIPT!, "utf8"));
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let vendorId: string | undefined;
  try {
    const identity = (await db.query("SELECT current_database() AS name, oid::text, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
    expect(identity).toEqual({ name: receipt.name, oid: receipt.oid, marker: receipt.marker });
    expect((await db.query("SELECT count(*)::int AS n FROM docflow.document_header")).rows[0].n).toBe(0);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    const summary = page.getByRole("region", { name: "Summary", exact: true });
    const kpi = (label: string) => summary.getByRole("group", { name: label, exact: true }).locator("[data-kpi-value]");
    await expect(kpi("Documents")).toHaveText("0");
    await expect(kpi("Vendors")).toHaveText("1");
    for (const label of ["Awaiting approval", "Approved value", "Approved this month"]) await expect(kpi(label)).toHaveText("0.00");
    await expect(page.getByText("No documents yet. Create your first draft to get started.")).toBeVisible();
    for (const status of ["draft", "submitted", "approved", "rejected"]) await expect(page.locator(`[data-status-row="${status}"]`)).toHaveText(new RegExp(`${status}0\\s*0%`));
    await page.screenshot({ path: testInfo.outputPath("empty-desktop.png"), fullPage: true });
    vendorId = (await db.query("INSERT INTO docflow.vendor(code,name) VALUES ('Q1-UI','Northbridge Office & Technical Supplies') RETURNING id::text")).rows[0].id;
    for (const [index, status] of ["draft", "draft", "draft", "submitted", "approved", "rejected"].entries()) {
      const shno = (await db.query("INSERT INTO docflow.document_header(document_number,document_date,vendor_id) VALUES ($1,date_trunc('month',current_date)::date,$2) RETURNING shno::text", [`DOC-2026-${String(900001 + index)}`, vendorId])).rows[0].shno;
      await db.query("INSERT INTO docflow.document_detail(shno,line_no,item,quantity,price,amount) VALUES ($1,1,$2,2,1250.25,2500.50)", [shno, "Extended catalogue item with a readable description and technical specifications"]);
      if (status !== "draft") await db.query("UPDATE docflow.document_header SET status='submitted' WHERE shno=$1", [shno]);
      if (status === "approved" || status === "rejected") await db.query("UPDATE docflow.document_header SET status=$2 WHERE shno=$1", [shno, status]);
    }
    await page.reload();
    await expect(kpi("Documents")).toHaveText("6");
    await expect(kpi("Vendors")).toHaveText("2");
    for (const label of ["Awaiting approval", "Approved value", "Approved this month"]) await expect(kpi(label)).toHaveText("2500.50");
    await expect(summary.getByRole("group", { name: "Vendors", exact: true })).toContainText("2 active");
    await expect(summary.getByRole("group", { name: "Approved this month", exact: true })).toContainText("1 document(s)");
    for (const [status, count, percent] of [["draft", 3, 50], ["submitted", 1, 17], ["approved", 1, 17], ["rejected", 1, 17]] as const) {
      await expect(page.locator(`[data-status-row="${status}"]`)).toHaveText(new RegExp(`${status}${count}\\s*${percent}%`));
      const width = await page.locator(`[data-status-chart] [data-status="${status}"]`).evaluate((element) => parseFloat((element as HTMLElement).style.width));
      expect(width).toBeCloseTo(count / 6 * 100, 3);
    }
    await expect(page.getByRole("list", { name: "Status legend" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Main", exact: true }).filter({ visible: true }).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    const focusStyle = await skip.evaluate((element) => ({ outline: getComputedStyle(element).outlineStyle, color: getComputedStyle(element).outlineColor }));
    expect(focusStyle.outline).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    const accessibleNamesPath = testInfo.outputPath("dashboard-accessibility.txt");
    await writeFile(accessibleNamesPath, await page.locator("body").ariaSnapshot());
    await testInfo.attach("dashboard accessible names and landmarks", { path: accessibleNamesPath, contentType: "text/plain" });
    const focusStylesPath = testInfo.outputPath("dashboard-focus-and-text-styles.json");
    await writeFile(focusStylesPath, JSON.stringify({ focusStyle, text: await page.locator("h1, [data-kpi-value], [data-status-row]").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent, color: getComputedStyle(element).color, size: getComputedStyle(element).fontSize }))) }, null, 2));
    await testInfo.attach("rendered focus and text styles", { path: focusStylesPath, contentType: "application/json" });
    const detail = (await db.query("SELECT shno::text FROM docflow.document_header WHERE vendor_id=$1 ORDER BY shno LIMIT 1", [vendorId])).rows[0].shno;
    for (const width of [1440, 1024, 768, 390, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path] of [["dashboard", "/"], ["documents", "/documents"], ["vendors", "/vendors"], ["detail", `/documents/${detail}`]]) {
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        const geometry = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll("main, main *")].flatMap((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (rect.right <= window.innerWidth && element.getAttribute("role") !== "region" && !["grid", "flex"].includes(style.display) && !["MAIN", "FORM", "INPUT", "TABLE"].includes(element.tagName)) return [];
            return [{ tag: element.tagName, id: element.id, class: element.className, left: rect.left, right: rect.right, width: rect.width,
              clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, minWidth: style.minWidth, maxWidth: style.maxWidth,
              display: style.display, gridColumns: style.gridTemplateColumns, position: style.position, overflowX: style.overflowX, boxSizing: style.boxSizing }];
          }),
        }));
        await writeFile(testInfo.outputPath(`${name}-${width}-geometry.json`), JSON.stringify(geometry, null, 2));
        await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await page.locator("a button, button a").count()).toBe(0);
        const scrollRegion = page.getByRole("region", { name: /table$/ }).first();
        if (await scrollRegion.count()) {
          await expect(scrollRegion).toHaveCSS("position", "relative");
          await expect(scrollRegion.getByRole("columnheader").first()).toHaveCSS("color", "rgb(71, 85, 105)");
          await scrollRegion.focus();
          await expect(scrollRegion).toBeFocused();
          const overflowing = await scrollRegion.evaluate((element) => element.scrollWidth > element.clientWidth);
          if (overflowing) {
            await page.keyboard.press("ArrowRight");
            await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
          }
        }
      }
      await page.goto("/");
      if (width < 768) {
        const menu = page.getByLabel("Main menu", { exact: true });
        await menu.focus();
        await page.keyboard.press("Enter");
      }
      const documentsLink = page.getByRole("navigation", { name: "Main", exact: true }).filter({ visible: true }).getByRole("link", { name: "Documents", exact: true });
      await documentsLink.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/documents$/);
      await expect(page.getByRole("navigation", { name: "Main", exact: true }).filter({ visible: true }).getByRole("link", { name: "Documents", exact: true })).toHaveAttribute("aria-current", "page");
    }
    const approved = (await db.query("SELECT shno::text FROM docflow.document_header WHERE vendor_id=$1 AND status='approved'", [vendorId])).rows[0].shno;
    await page.goto(`/documents/${approved}`);
    await expect(page.getByText("This document is approved and can no longer be edited.")).toHaveCSS("color", "rgb(24, 24, 27)");
  } finally {
    if (vendorId) {
      await db.query("DELETE FROM docflow.document_header WHERE vendor_id=$1", [vendorId]);
      await db.query("DELETE FROM docflow.vendor WHERE id=$1", [vendorId]);
    }
    await db.end();
  }
});
