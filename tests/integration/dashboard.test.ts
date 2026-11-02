import { beforeAll, describe, expect, it } from "vitest";

import { getDashboard } from "../../lib/docflow/dashboard";
import { insertDocument, insertVendor, resetSchema, withClient } from "./reset-schema";

let vendorId = "";
let approvedShno = "";

beforeAll(async () => {
  await resetSchema();
  await withClient(async (client) => {
    vendorId = await insertVendor(client, "V-100", "Aggregate Supply");
    await insertDocument(client, {
      number: "DOC-T-1",
      date: "2026-01-10",
      vendorId,
      status: "approved",
      items: [
        { item: "Alpha", quantity: "2", price: "10.50" },
        { item: "Beta", quantity: "3", price: "1.25" },
      ],
    });
    approvedShno = await insertDocument(client, {
      number: "DOC-T-2",
      date: "2026-02-11",
      vendorId,
      status: "submitted",
      items: [{ item: "Gamma", quantity: "4", price: "2.50" }],
    });
  });
});

describe("getDashboard", () => {
  it("counts documents per status from the database", async () => {
    const data = await getDashboard();
    const byStatus = Object.fromEntries(data.byStatus.map((row) => [row.status, row.count]));
    expect(byStatus.approved).toBe(1);
    expect(byStatus.submitted).toBe(1);
    expect(byStatus.draft).toBe(0);
    expect(byStatus.rejected).toBe(0);
    expect(data.totalDocuments).toBe(2);
  });

  it("sums approved and awaiting-approval value as exact decimal strings", async () => {
    const data = await getDashboard();
    // 2 * 10.50 + 3 * 1.25 = 24.75, computed by the database trigger.
    expect(data.approvedValue).toBe("24.75");
    expect(data.awaitingApprovalValue).toBe("10.00");
  });

  it("reports vendor counts", async () => {
    const data = await getDashboard();
    expect(data.vendorCount).toBe(1);
    expect(data.activeVendorCount).toBe(1);
  });

  it("orders recent documents newest first", async () => {
    const data = await getDashboard();
    expect(data.recent[0]?.shno).toBe(approvedShno);
    expect(data.recent[0]?.documentNumber).toBe("DOC-T-2");
    expect(data.recent[0]?.vendorName).toBe("Aggregate Supply");
  });
});
