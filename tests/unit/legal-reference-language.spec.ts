import { describe, expect, it } from "vitest";

import { buildLegalReferenceTriggerLabel } from "../../components/ComplianceViolationCard";

describe("legal reference language", () => {
  it("frames mapped authorities as review references instead of legal conclusions", () => {
    const label = buildLegalReferenceTriggerLabel([
      {
        statute: "PIPEDA",
        section: "Schedule 1, Principle 4.6",
        id: "PIPEDA_4_6",
      },
    ]);

    expect(label).toBe("This item may require review under PIPEDA Schedule 1, Principle 4.6");
    expect(label).not.toMatch(/confirmed legal violation/i);
    expect(label).not.toMatch(/proves? (a )?violation/i);
  });

  it("uses neutral fallback text when only a mapped reference id is available", () => {
    expect(buildLegalReferenceTriggerLabel([{ id: "METRO2_BASE_SEGMENT" }])).toBe(
      "This item may require review under METRO2_BASE_SEGMENT",
    );
  });
});
