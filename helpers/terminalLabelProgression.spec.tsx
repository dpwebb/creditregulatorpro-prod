import { calculateTerminalLabel } from "./terminalLabelProgression";

describe("calculateTerminalLabel", () => {
  it("returns Phase 1 for an empty array", () => {
    expect(calculateTerminalLabel([])).toBe("PHASE 1: FOUNDATIONAL CHALLENGE — PENDING");
  });

  it("returns Phase 1 for 1 instance with a non-exhausted state", () => {
    expect(calculateTerminalLabel([{ state: "PENDING" }])).toBe("PHASE 1: FOUNDATIONAL CHALLENGE — PENDING");
  });

  it("returns Phase 2 for 2 instances with non-exhausted states", () => {
    expect(calculateTerminalLabel([{ state: "COMPLETED" }, { state: "PENDING" }])).toBe(
      "PHASE 2: METHODOLOGICAL CHALLENGE — PENDING"
    );
  });

  it("returns Phase 4 for 4+ instances with non-exhausted states", () => {
    const instances = [
      { state: "COMPLETED" },
      { state: "COMPLETED" },
      { state: "COMPLETED" },
      { state: "COMPLETED" },
    ];
    expect(calculateTerminalLabel(instances)).toBe("PHASE 4: PROCEDURAL EXHAUSTION — PENDING");
  });

  it("returns Phase 4 for 5+ instances with non-exhausted states (capped at Phase 4)", () => {
    const instances = [
      { state: "COMPLETED" },
      { state: "COMPLETED" },
      { state: "COMPLETED" },
      { state: "COMPLETED" },
      { state: "PENDING" },
    ];
    expect(calculateTerminalLabel(instances)).toBe("PHASE 4: PROCEDURAL EXHAUSTION — PENDING");
  });

  it("returns Phase 4 if any instance has state 'PROCEDURALLY_EXHAUSTED'", () => {
    expect(calculateTerminalLabel([{ state: "PROCEDURALLY_EXHAUSTED" }])).toBe("PHASE 4: PROCEDURAL EXHAUSTION — PENDING");
  });

  it("returns Phase 4 for mixed states containing an exhausted instance", () => {
    const instances = [
      { state: "COMPLETED" },
      { state: "PROCEDURALLY_EXHAUSTED" },
      { state: "PENDING" },
    ];
    expect(calculateTerminalLabel(instances)).toBe("PHASE 4: PROCEDURAL EXHAUSTION — PENDING");
  });
});