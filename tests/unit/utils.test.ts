import { describe, expect, it } from "vitest";

import { cn } from "../../lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes, keeping the later one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("bg-red-500", "bg-blue-500", "p-1")).toBe(
      "bg-blue-500 p-1"
    );
  });

  it("drops falsy, null, undefined and false values", () => {
    expect(cn("p-2", null, undefined, false, 0)).toBe("p-2");
    const hidden = false;
    const shown = true;
    expect(cn(hidden && "p-2", shown && "p-4")).toBe("p-4");
    expect(cn(undefined)).toBe("");
  });

  it("keeps non-conflicting classes in order", () => {
    expect(cn("flex", "items-center", "rounded-md")).toBe(
      "flex items-center rounded-md"
    );
  });

  it("accepts conditional objects", () => {
    expect(cn({ "p-2": false, "p-4": true })).toBe("p-4");
  });
});
