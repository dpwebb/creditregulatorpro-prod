import { describe, expect, it } from "vitest";
import { compareConsumerInfo } from "../../helpers/parserPatternAnalyzer";

describe("parserPatternAnalyzer", () => {
  it("compares approved date of birth expectations", () => {
    const results = compareConsumerInfo(
      { dateOfBirth: "1961-01-30T00:00:00.000Z" } as any,
      { dateOfBirth: "1961-01-31T00:00:00.000Z" } as any,
      "",
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: "dateOfBirth",
          passed: false,
        }),
      ]),
    );
  });
});
