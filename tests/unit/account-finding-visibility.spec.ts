import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isVisibleAccountFinding } from "../../helpers/accountFindingVisibility";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("account finding visibility", () => {
  it("shows only active persisted findings that are not parser or user-review candidates", () => {
    expect(isVisibleAccountFinding({ userStatus: "active", validationStatus: "PENDING" })).toBe(true);
    expect(isVisibleAccountFinding({ userStatus: null, validationStatus: null })).toBe(true);

    expect(isVisibleAccountFinding({ userStatus: "dismissed", validationStatus: "PENDING" })).toBe(false);
    expect(isVisibleAccountFinding({ userStatus: "verified", validationStatus: "PENDING" })).toBe(false);
    expect(isVisibleAccountFinding({ userStatus: "active", validationStatus: "PARSER_UNCERTAIN" })).toBe(false);
    expect(isVisibleAccountFinding({ userStatus: "active", validationStatus: "NEEDS_PARSER_REVIEW" })).toBe(false);
    expect(isVisibleAccountFinding({ userStatus: "active", validationStatus: "NEEDS_USER_REVIEW" })).toBe(false);
  });

  it("keeps the Accounts list wired to persisted creditor obligation tests without packet readiness mutation", () => {
    const text = source("endpoints/tradeline/list_GET.ts");

    expect(text).toContain("isVisibleAccountFinding");
    expect(text).toContain("'creditorObligationTest.userStatus'");
    expect(text).toContain("'creditorObligationTest.validationStatus'");
    expect(text).not.toMatch(/evaluatePacketReadinessForIssues|packetReady|disputePacketFindings/);
  });
});
