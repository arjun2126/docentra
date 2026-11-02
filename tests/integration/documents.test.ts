import { beforeAll, describe, expect, it } from "vitest";

import {
  createDocument,
  getDocument,
  transitionDocument,
  updateDocument,
} from "../../lib/docflow/documents";
import {
  DocumentNotFoundError,
  IllegalTransitionError,
  ImmutableDocumentError,
  StaleDocumentError,
} from "../../lib/docflow/errors";
import type { DocumentValues } from "../../lib/schemas/document";
import { insertVendor, resetSchema, withClient } from "./reset-schema";

let vendorId = "";

beforeAll(async () => {
  await resetSchema();
  await withClient(async (client) => {
    vendorId = await insertVendor(client, "V-200", "Lifecycle Supply");
  });
});

function input(overrides: Partial<DocumentValues> = {}): DocumentValues {
  return {
    vendorId,
    documentDate: "2026-03-04",
    notes: "Integration fixture",
    lines: [
      { item: "Paper", quantity: "2", price: "10.50" },
      { item: "Toner", quantity: "3", price: "1.25" },
    ],
    ...overrides,
  } as DocumentValues;
}

describe("createDocument", () => {
  it("computes every amount and the total on the server", async () => {
    const doc = await createDocument(input());
    expect(doc.status).toBe("draft");
    expect(doc.lineCount).toBe(2);
    expect(doc.totalAmount).toBe("24.75");
    expect(doc.lines.map((line) => line.amount)).toEqual(["21.00", "3.75"]);
    expect(doc.lines.map((line) => line.lineNo)).toEqual([1, 2]);
  });

  it("allocates sequential document numbers per year", async () => {
    const first = await createDocument(input());
    const second = await createDocument(input());
    expect(first.documentNumber).toMatch(/^DOC-2026-\d{6}$/);
    const firstSeq = Number(first.documentNumber.slice(-6));
    const secondSeq = Number(second.documentNumber.slice(-6));
    expect(secondSeq).toBe(firstSeq + 1);
  });

  it("rejects an unknown or inactive vendor", async () => {
    await expect(createDocument(input({ vendorId: "999999" }))).rejects.toBeTruthy();
  });
});

describe("updateDocument", () => {
  it("replaces lines atomically and recomputes totals", async () => {
    const doc = await createDocument(input());
    const updated = await updateDocument(doc.shno, doc.version, input({
      lines: [{ item: "Only line", quantity: "4", price: "2.50" }],
    }));

    expect(updated.lines).toHaveLength(1);
    expect(updated.totalAmount).toBe("10.00");
    expect(updated.lineCount).toBe(1);
    expect(updated.version).toBe(doc.version + 1);
  });

  it("rolls back when the write fails mid-transaction", async () => {
    const doc = await createDocument(input());
    // A non-existent vendor satisfies the schema but violates the foreign key
    // after the version check, so the deletes must be rolled back.
    await expect(
      updateDocument(doc.shno, doc.version, input({ vendorId: "999999" })),
    ).rejects.toBeTruthy();

    const reloaded = await getDocument(doc.shno);
    expect(reloaded?.lines).toHaveLength(2);
    expect(reloaded?.totalAmount).toBe("24.75");
    expect(reloaded?.version).toBe(doc.version);
  });

  it("rejects a stale version instead of overwriting", async () => {
    const doc = await createDocument(input());
    const first = await updateDocument(doc.shno, doc.version, input());
    await expect(
      updateDocument(doc.shno, doc.version, input({ notes: "stale write" })),
    ).rejects.toBeInstanceOf(StaleDocumentError);
    expect(first.version).toBe(doc.version + 1);
  });
});

describe("workflow", () => {
  it("moves draft to submitted to approved", async () => {
    const doc = await createDocument(input());
    const submitted = await transitionDocument(doc.shno, "submitted", doc.version);
    expect(submitted.status).toBe("submitted");
    const approved = await transitionDocument(doc.shno, "approved", submitted.version);
    expect(approved.status).toBe("approved");
  });

  it("rejects shortcuts such as draft to approved", async () => {
    const doc = await createDocument(input());
    await expect(
      transitionDocument(doc.shno, "approved", doc.version),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it("requires the current version", async () => {
    const doc = await createDocument(input());
    await transitionDocument(doc.shno, "submitted", doc.version);
    await expect(
      transitionDocument(doc.shno, "approved", doc.version),
    ).rejects.toBeInstanceOf(StaleDocumentError);
  });

  it("reports a missing document", async () => {
    await expect(transitionDocument("99999999", "submitted", 1)).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
  });
});

describe("approved documents are immutable", () => {
  async function approvedDocument() {
    const doc = await createDocument(input());
    const submitted = await transitionDocument(doc.shno, "submitted", doc.version);
    return transitionDocument(doc.shno, "approved", submitted.version);
  }

  it("refuses content edits through the repository", async () => {
    const doc = await approvedDocument();
    await expect(updateDocument(doc.shno, doc.version, input())).rejects.toBeInstanceOf(
      ImmutableDocumentError,
    );
  });

  it("refuses content edits at the database layer even without the repository", async () => {
    const doc = await approvedDocument();
    await expect(
      withClient((client) =>
        client.query("update docflow.document_header set notes = $1 where shno = $2", [
          "bypassed",
          doc.shno,
        ]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses to reopen itself with a bare status update", async () => {
    const doc = await approvedDocument();
    await expect(
      withClient((client) =>
        client.query("update docflow.document_header set status = 'draft' where shno = $1", [
          doc.shno,
        ]),
      ),
    ).rejects.toThrow(/immutable/i);
  });

  it("refuses new lines at the database layer", async () => {
    const doc = await approvedDocument();
    await expect(
      withClient((client) =>
        client.query(
          `insert into docflow.document_detail (shno, line_no, item, quantity, price, amount)
           values ($1, 99, 'Sneaky', 1, 1, 1)`,
          [doc.shno],
        ),
      ),
    ).rejects.toThrow(/immutable/i);
  });
});
