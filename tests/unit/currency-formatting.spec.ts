import { describe, expect, it } from "vitest";

import { formatCurrency, parseCurrencyAmount } from "../../helpers/formatters";

describe("reported dollar-value formatting", () => {
  it("formats credit report money values with a dollar sign, grouping, and fixed cents", () => {
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(123456789.4)).toBe("$123,456,789.40");
    expect(formatCurrency("CAD $1,234,567.8")).toBe("$1,234,567.80");
  });

  it("does not invent display values for unreported or non-money inputs", () => {
    expect(formatCurrency(null)).toBe("");
    expect(formatCurrency(undefined)).toBe("");
    expect(formatCurrency("Not reported")).toBe("");
    expect(parseCurrencyAmount("Not reported")).toBeNull();
  });

});
