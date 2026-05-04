import { detectStaleReportingFailure } from "./complianceDetectorStaleReporting";

describe("detectStaleReportingFailure", () => {
  it("does not flag closed accounts with a dateClosed value", () => {
    const violations = detectStaleReportingFailure(
      {
        id: 1,
        status: "11",
        dateClosed: new Date("2024-01-10T00:00:00.000Z"),
        lastReportedDate: new Date("2024-01-10T00:00:00.000Z"),
        postedDate: null,
        balance: 0,
        isCollectionAccount: false,
      } as any,
      new Date("2026-01-10T00:00:00.000Z")
    );

    expect(violations.length).toBe(0);
  });

  it("does not flag terminal Metro2 status code 13", () => {
    const violations = detectStaleReportingFailure(
      {
        id: 2,
        status: "13",
        dateClosed: null,
        lastReportedDate: new Date("2023-10-10T00:00:00.000Z"),
        postedDate: null,
        balance: 0,
        isCollectionAccount: false,
      } as any,
      new Date("2026-02-10T00:00:00.000Z")
    );

    expect(violations.length).toBe(0);
  });

  it("does not flag terminal status text from bureau labels", () => {
    const violations = detectStaleReportingFailure(
      {
        id: 21,
        status: "Closed by the company",
        dateClosed: null,
        lastReportedDate: new Date("2024-01-10T00:00:00.000Z"),
        postedDate: null,
        balance: 0,
        isCollectionAccount: false,
      } as any,
      new Date("2026-02-10T00:00:00.000Z")
    );

    expect(violations.length).toBe(0);
  });

  it("does not flag collection tradelines", () => {
    const violations = detectStaleReportingFailure(
      {
        id: 22,
        status: "11",
        dateClosed: null,
        lastReportedDate: new Date("2024-01-10T00:00:00.000Z"),
        postedDate: null,
        balance: 1000,
        isCollectionAccount: true,
      } as any,
      new Date("2026-02-10T00:00:00.000Z")
    );

    expect(violations.length).toBe(0);
  });

  it("still flags active accounts that have gone stale", () => {
    const violations = detectStaleReportingFailure(
      {
        id: 3,
        status: "11",
        dateClosed: null,
        lastReportedDate: new Date("2025-01-10T00:00:00.000Z"),
        postedDate: null,
        balance: 3500,
        isCollectionAccount: false,
      } as any,
      new Date("2025-06-10T00:00:00.000Z")
    );

    expect(violations.length).toBe(1);
    expect(violations[0].violationCategory).toBe("STALE_REPORTING_FAILURE");
  });
});
