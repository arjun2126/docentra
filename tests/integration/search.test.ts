import { beforeAll, describe, expect, it } from "vitest";

import { searchDocuments } from "../../lib/docflow/search";
import { parseSearchParams, type SearchParams } from "../../lib/schemas/search";
import { insertDocument, insertVendor, resetSchema, withClient } from "./reset-schema";

let alpha = "";
let beta = "";

function params(overrides: Record<string, string> = {}): SearchParams {
  const parsed = parseSearchParams({ pageSize: "10", ...overrides });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
  return parsed.data;
}

beforeAll(async () => {
  await resetSchema();
  await withClient(async (client) => {
    alpha = await insertVendor(client, "V-300", "Alpha Papers");
    beta = await insertVendor(client, "V-301", "Beta Toner");

    await insertDocument(client, {
      number: "DOC-2026-000101",
      date: "2026-01-10",
      vendorId: alpha,
      items: [{ item: "100% cotton paper", quantity: "2", price: "5.00" }],
    });
    await insertDocument(client, {
      number: "DOC-2026-000102",
      date: "2026-02-10",
      vendorId: beta,
      status: "submitted",
      items: [{ item: "Black toner", quantity: "1", price: "60.00" }],
    });
    await insertDocument(client, {
      number: "DOC-2026-000103",
      date: "2026-03-10",
      vendorId: alpha,
      status: "approved",
      items: [{ item: "Envelopes", quantity: "50", price: "0.20" }],
    });
  });
});

describe("searchDocuments", () => {
  it("returns everything with a total and page metadata", async () => {
    const result = await searchDocuments(params());
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.pageCount).toBe(1);
  });

  it("matches by document number", async () => {
    const result = await searchDocuments(params({ q: "000102" }));
    expect(result.items.map((doc) => doc.documentNumber)).toEqual(["DOC-2026-000102"]);
  });

  it("matches by vendor name and by line item text", async () => {
    expect((await searchDocuments(params({ q: "alpha" }))).total).toBe(2);
    expect((await searchDocuments(params({ q: "toner" }))).total).toBe(1);
  });

  it("treats LIKE metacharacters literally", async () => {
    expect((await searchDocuments(params({ q: "100%" }))).total).toBe(1);
    // Without escaping, "_" would match any single character and return rows.
    expect((await searchDocuments(params({ q: "1_0" }))).total).toBe(0);
  });

  it("filters by status, vendor and date range", async () => {
    expect((await searchDocuments(params({ status: "approved" }))).total).toBe(1);
    expect((await searchDocuments(params({ vendorId: alpha }))).total).toBe(2);
    expect(
      (await searchDocuments(params({ from: "2026-02-01", to: "2026-02-28" }))).total,
    ).toBe(1);
    expect(
      (await searchDocuments(params({ status: "draft", vendorId: alpha }))).total,
    ).toBe(1);
  });

  it("combines filters and search text", async () => {
    // "cotton" appears only on the draft line item; "paper" would also match
    // the vendor name Alpha Papers, which is exactly the cross-field behaviour
    // being asserted above.
    expect((await searchDocuments(params({ q: "cotton", status: "draft" }))).total).toBe(1);
    expect((await searchDocuments(params({ q: "cotton", status: "approved" }))).total).toBe(0);
  });

  it("paginates deterministically and clamps page count", async () => {
    const first = await searchDocuments(params({ pageSize: "10" }));
    expect(first.items[0]?.documentNumber).toBe("DOC-2026-000103");

    const small = await searchDocuments(params({ pageSize: "10", page: "1" }));
    expect(small.pageCount).toBe(1);

    const beyond = await searchDocuments(params({ page: "5", pageSize: "10" }));
    expect(beyond.items).toHaveLength(0);
    expect(beyond.total).toBe(3);
  });

  it("orders newest first", async () => {
    const result = await searchDocuments(params());
    const dates = result.items.map((doc) => doc.documentDate);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

describe("parseSearchParams", () => {
  it("rejects an inverted date range", () => {
    const result = parseSearchParams({ from: "2026-05-01", to: "2026-04-01" });
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported page sizes and bad statuses", () => {
    expect(parseSearchParams({ pageSize: "999" }).ok).toBe(false);
    expect(parseSearchParams({ status: "deleted" }).ok).toBe(false);
  });

  it("falls back to defaults for empty input", () => {
    const result = parseSearchParams({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.page).toBe(1);
    expect(result.data.pageSize).toBe(25);
    expect(result.data.q).toBeUndefined();
  });
});
