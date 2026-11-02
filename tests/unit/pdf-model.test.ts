import { describe, expect, it } from "vitest";

import type { DocumentDto } from "../../lib/docflow/documents";
import { buildDocumentPdfModel, renderDocumentPdf } from "../../lib/pdf/document-pdf";

const document: DocumentDto = {
  shno: "42",
  documentNumber: "DOC-2026-000042",
  documentDate: "2026-10-05",
  status: "approved",
  totalAmount: "24.75",
  lineCount: 2,
  notes: null,
  version: 3,
  vendor: { id: "7", code: "V-001", name: "Northwind Paper" },
  lines: [
    { lineNo: 1, item: "A4 paper", quantity: "2.0000", price: "10.50", amount: "21.00" },
    { lineNo: 2, item: "Toner — black", quantity: "3.0000", price: "1.25", amount: "3.75" },
  ],
};

describe("buildDocumentPdfModel", () => {
  it("uses the stored totals instead of recomputing them", () => {
    const model = buildDocumentPdfModel({ ...document, totalAmount: "999.99" });
    expect(model.total).toBe("999.99");
  });

  it("maps every line into a row with the amount as given", () => {
    const model = buildDocumentPdfModel(document);
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toEqual(["1", "A4 paper", "2.0000", "10.50", "21.00"]);
    expect(model.rows[1][4]).toBe("3.75");
  });

  it("transliterates characters the standard PDF fonts cannot encode", () => {
    const model = buildDocumentPdfModel(document);
    expect(model.rows[1][1]).toBe("Toner - black");
  });

  it("includes vendor, date and status for auditability", () => {
    const model = buildDocumentPdfModel(document);
    expect(model.subtitle.join(" ")).toContain("Northwind Paper");
    expect(model.subtitle.join(" ")).toContain("2026-10-05");
    expect(model.subtitle.join(" ")).toContain("approved");
  });
});

describe("renderDocumentPdf", () => {
  it("produces a real PDF byte stream", async () => {
    const bytes = await renderDocumentPdf(buildDocumentPdfModel(document));
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
