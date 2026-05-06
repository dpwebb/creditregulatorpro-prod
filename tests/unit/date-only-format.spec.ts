import { describe, expect, it } from "vitest";

import { formatDateOnlyEnCa } from "../../helpers/dateOnly";

describe("formatDateOnlyEnCa", () => {
  it("preserves the reported calendar date from ISO parser output", () => {
    expect(formatDateOnlyEnCa("2026-04-16T00:00:00.000Z")).toBe("2026-04-16");
    expect(formatDateOnlyEnCa("2026-04-16")).toBe("2026-04-16");
  });

  it("normalizes numeric date-only values", () => {
    expect(formatDateOnlyEnCa("2026/4/6")).toBe("2026-04-06");
  });
});
