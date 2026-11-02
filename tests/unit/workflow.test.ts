import { describe, expect, it } from "vitest";

import { IllegalTransitionError } from "../../lib/docflow/errors";
import { allowedTransitions, canTransition, isEditable } from "../../lib/docflow/workflow";
import { parseDocumentInput } from "../../lib/schemas/document";

describe("workflow", () => {
  it("allows only the documented transitions", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("submitted", "rejected")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("rejects shortcuts and backward moves", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("approved", "submitted")).toBe(false);
  });

  it("treats approved as terminal and draft as the only editable state", () => {
    expect(allowedTransitions("approved")).toEqual([]);
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("submitted")).toBe(false);
    expect(isEditable("rejected")).toBe(false);
  });

  it("reports illegal transitions with a typed error", async () => {
    const { assertTransition } = await import("../../lib/docflow/workflow");
    expect(() => assertTransition("draft", "approved")).toThrow(IllegalTransitionError);
  });
});

describe("parseDocumentInput", () => {
  const base = {
    vendorId: "1",
    documentDate: "2026-03-04",
    lines: [{ item: "Paper", quantity: "2", price: "10.00" }],
  };

  it("accepts a valid document", () => {
    expect(parseDocumentInput(base).ok).toBe(true);
  });

  it("requires at least one line", () => {
    const result = parseDocumentInput({ ...base, lines: [] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.fieldErrors.lines?.length).toBeGreaterThan(0);
  });

  it("rejects zero quantity, negative price and extra decimals", () => {
    for (const lines of [
      [{ item: "A", quantity: "0", price: "1" }],
      [{ item: "A", quantity: "1", price: "-1" }],
      [{ item: "A", quantity: "1.23456", price: "1" }],
    ]) {
      expect(parseDocumentInput({ ...base, lines }).ok).toBe(false);
    }
  });

  it("rejects an impossible date", () => {
    expect(parseDocumentInput({ ...base, documentDate: "2026-02-31" }).ok).toBe(false);
  });
});
