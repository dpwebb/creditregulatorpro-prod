import { evaluateMixedFileSignals } from "./complianceDetectorMixedFile";

describe("evaluateMixedFileSignals", () => {
  it("does not report mixed-file when only the last name differs", () => {
    const signals = evaluateMixedFileSignals({
      userFullName: "Mock Lifecycle User",
      reportFullName: "DAVID PHILIP WEBB",
      userDateOfBirth: "1961-01-30T00:00:00.000Z",
      reportDateOfBirth: "1961-01-30T00:00:00.000Z",
      userProvince: "NS",
      reportProvince: "NS",
    });

    expect(signals.nameMismatch).toBe(true);
    expect(signals.dobMismatch).toBe(false);
    expect(signals.addressMismatch).toBe(false);
    expect(signals.shouldReportNameMismatch).toBe(false);
  });

  it("reports name mismatch only when corroborated by another identity mismatch", () => {
    const signals = evaluateMixedFileSignals({
      userFullName: "Jane Smith",
      reportFullName: "DAVID PHILIP WEBB",
      userDateOfBirth: "1961-01-30T00:00:00.000Z",
      reportDateOfBirth: "1961-01-30T00:00:00.000Z",
      userProvince: "ON",
      reportProvince: "NS",
    });

    expect(signals.nameMismatch).toBe(true);
    expect(signals.addressMismatch).toBe(true);
    expect(signals.shouldReportNameMismatch).toBe(true);
  });

  it("still reports date-of-birth mismatch as the strongest mixed-file signal", () => {
    const signals = evaluateMixedFileSignals({
      userFullName: "David Webb",
      reportFullName: "DAVID PHILIP WEBB",
      userDateOfBirth: "1975-05-10T00:00:00.000Z",
      reportDateOfBirth: "1961-01-30T00:00:00.000Z",
      userProvince: "NS",
      reportProvince: "NS",
    });

    expect(signals.dobMismatch).toBe(true);
  });
});
