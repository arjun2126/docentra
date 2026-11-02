import { describe, expect, it } from "vitest";

import { parseVendorInput, vendorInputSchema } from "../../lib/schemas/vendor";

const valid = { code: "acme-1", name: " Acme Supply ", isActive: true };

describe("vendorInputSchema", () => {
  it("trims the name and upper-cases the code", () => {
    const parsed = vendorInputSchema.parse(valid);
    expect(parsed.name).toBe("Acme Supply");
    expect(parsed.code).toBe("ACME-1");
  });

  it("treats an empty optional email as absent", () => {
    const parsed = vendorInputSchema.parse({ ...valid, email: "" });
    expect(parsed.email).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    const result = vendorInputSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a code with spaces or symbols", () => {
    expect(vendorInputSchema.safeParse({ ...valid, code: "AC ME" }).success).toBe(false);
    expect(vendorInputSchema.safeParse({ ...valid, code: "AC_ME" }).success).toBe(false);
  });

  it("rejects a one-character name", () => {
    const result = vendorInputSchema.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields instead of silently dropping them", () => {
    const result = vendorInputSchema.safeParse({ ...valid, balance: 100 });
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true", () => {
    const parsed = vendorInputSchema.parse({ code: "V1", name: "Valid Name" });
    expect(parsed.isActive).toBe(true);
  });
});

describe("parseVendorInput", () => {
  it("returns per-field messages for the form", () => {
    const result = parseVendorInput({ code: "x", name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.fieldErrors.code?.length).toBeGreaterThan(0);
    expect(result.fieldErrors.name?.length).toBeGreaterThan(0);
  });

  it("returns the parsed values on success", () => {
    const result = parseVendorInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.code).toBe("ACME-1");
  });
});
