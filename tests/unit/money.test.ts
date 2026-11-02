import { describe, expect, it } from "vitest";

import { multiplyAmount, sumAmounts } from "../../lib/docflow/money";

describe("multiplyAmount", () => {
  it("multiplies exactly where floating point would drift", () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point.
    expect(multiplyAmount("3", "0.1")).toBe("0.30");
    expect(multiplyAmount("1.005", "1.00")).toBe("1.01");
    expect(multiplyAmount("20", "4.25")).toBe("85.00");
  });

  it("rounds half-up to two decimals like SQL round()", () => {
    // Prices are limited to 2 decimals, so the half-cent case comes from a
    // four-decimal quantity: 1.005 * 1.00 = 1.005 -> 1.01.
    expect(multiplyAmount("1.005", "1.00")).toBe("1.01");
    expect(multiplyAmount("1.0049", "1.00")).toBe("1.00");
    expect(multiplyAmount("3", "0.33")).toBe("0.99");
  });

  it("accepts four-decimal quantities", () => {
    expect(multiplyAmount("2.5000", "3.99")).toBe("9.98");
    expect(multiplyAmount("0.0001", "1000.00")).toBe("0.10");
  });

  it("supports a zero price", () => {
    expect(multiplyAmount("5", "0")).toBe("0.00");
  });

  it("rejects negative and malformed input", () => {
    expect(() => multiplyAmount("-1", "2")).toThrow();
    expect(() => multiplyAmount("1.23456", "2")).toThrow();
    expect(() => multiplyAmount("abc", "2")).toThrow();
  });
});

describe("sumAmounts", () => {
  it("adds without accumulating float error", () => {
    expect(sumAmounts(["0.10", "0.20", "0.30"])).toBe("0.60");
    expect(sumAmounts([])).toBe("0.00");
    expect(sumAmounts(["999999999999.99", "0.01"])).toBe("1000000000000.00");
  });
});
