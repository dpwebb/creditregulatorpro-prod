import { describe, expect, it } from "vitest";

import { detectMetro2FieldViolations } from "../../helpers/complianceDetectorMetro2";
import { Metro2Rules2025 } from "../../helpers/metro2ValidationRules";
import {
  FACT_SOURCE_KINDS,
  accountBoundSourceText,
} from "../../helpers/reportFactSource";
import { hasTerminalReportingStatus } from "../../helpers/staleReportingGuard";
import { parseAccount } from "../../helpers/transunionAccountParser";

const TRANSUNION_LEGEND =
  "AC-Account current/non-derogatory, CG-Account cancelled by credit grantor, TC-Third party collection, WO-Write-off, CZ-Closed at consumer request";

function accountHtml({
  status = "Closed by the company",
  narrative,
  legend = TRANSUNION_LEGEND,
}: {
  status?: string;
  narrative?: string;
  legend?: string;
}): string {
  const paymentGrid = narrative
    ? `<table>
        <tr><th>Date</th><th>Balance</th><th>Payment</th><th>Past Due</th><th>MOP</th><th>Terms</th><th>High Credit</th><th>Credit Limit</th><th>Balloon Payment</th><th>Charge Off</th><th>Narrative</th></tr>
        <tr><td>Mar 2025</td><td>341</td><td>0</td><td>341</td><td>9</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>${narrative}</td></tr>
      </table>`
    : "";

  return `<table>
      <tr><th>Creditor Name</th><td>CAPITAL ONE CANADA</td></tr>
      <tr><th>Account Type</th><td>REVOLVING / INDIVIDUAL</td></tr>
      <tr><th>Status</th><td>${status}</td></tr>
      <tr><th>Last Payment</th><td>Apr 01, 2025</td></tr>
      <tr><th>Reported Date</th><td>May 01, 2026</td></tr>
    </table>
    ${paymentGrid}
    <table><tr><th>Legend</th><td>${legend}</td></tr></table>`;
}

async function detectorFieldsFromParsed(parsed: ReturnType<typeof parseAccount>): Promise<string[]> {
  const violations = await detectMetro2FieldViolations({
    id: 9001,
    accountType: parsed.accountType,
    amountPastDue: String(parsed.pastDue ?? 0),
    balance: String(parsed.balance ?? 0),
    chargeOffDate: parsed.chargeOffDate ?? null,
    collectionAgencyName: parsed.collectionAgencyName ?? null,
    creditorId: 11,
    dateAssignedToCollection: parsed.dateAssignedToCollection ?? null,
    dateClosed: parsed.dateClosed ?? null,
    dateOfFirstDelinquency: parsed.dateOfFirstDelinquency ?? null,
    dateOfLastPayment: parsed.lastPaymentDate ? new Date(parsed.lastPaymentDate) : new Date("2025-04-01T00:00:00.000Z"),
    isCollectionAccount: parsed.isCollectionAccount,
    lastReportedDate: parsed.dateReported ? new Date(parsed.dateReported) : new Date("2026-05-01T00:00:00.000Z"),
    mop: parsed.mop,
    originalCreditorName: parsed.originalCreditorName ?? null,
    sourceText: parsed.sourceText,
    status: parsed.status,
  } as any);

  return violations.map((violation) => String(violation.technicalDetails.fieldName));
}

describe("TransUnion legend source classification", () => {
  it("keeps legend-only WO/TC/CZ as codebook support, not account status, MOP, or collection truth", async () => {
    const parsed = parseAccount(accountHtml({}));

    expect(parsed.status).toBe("Closed by the company");
    expect(parsed.legend).toContain("WO-Write-off");
    expect(parsed.legend).toContain("TC-Third party collection");
    expect(parsed.mop).not.toBe("9");
    expect(parsed.isCollectionAccount).toBe(false);
    expect(parsed.collectionAgencyMissingFromReport).toBe(false);
    expect(accountBoundSourceText(parsed.sourceText)).not.toMatch(/WO-Write-off|TC-Third party collection|CZ-Closed/i);

    const fieldNames = await detectorFieldsFromParsed(parsed);
    expect(fieldNames).not.toEqual(
      expect.arrayContaining([
        "chargeOffDate",
        "dateOfFirstDelinquency",
        "dateAssignedToCollection",
        "collectionAgencyName",
        "dateClosed",
      ]),
    );
  });

  it("still treats applied account-level WO as an account-bound write-off signal", async () => {
    const parsed = parseAccount(accountHtml({ status: "Bad debt write-off", narrative: "WO / CG" }));
    expect(parsed.legend).toContain("WO-Write-off");
    expect(parsed.mop).toBe("9");

    const violations = await detectMetro2FieldViolations({
      id: 9002,
      accountType: "REVOLVING",
      amountPastDue: "248.00",
      balance: "248.00",
      chargeOffDate: null,
      collectionAgencyName: null,
      creditorId: 11,
      dateAssignedToCollection: null,
      dateClosed: null,
      dateOfFirstDelinquency: new Date("2024-01-01T00:00:00.000Z"),
      dateOfLastPayment: new Date("2023-10-27T00:00:00.000Z"),
      isCollectionAccount: false,
      lastReportedDate: new Date("2026-05-01T00:00:00.000Z"),
      mop: "9",
      sourceText:
        "Date Balance Payment Past Due MOP Terms High Credit Credit Limit Balloon Payment Charge Off Narrative 1 / 2\n" +
        "May 2026 248 0 248 9 0 300 0 0 WO /\n" +
        `Legend ${TRANSUNION_LEGEND}`,
      status: "Bad debt write-off",
    } as any);

    const chargeOffFinding = violations.find((violation) => violation.technicalDetails.fieldName === "chargeOffDate");
    expect(chargeOffFinding).toBeTruthy();
    expect(chargeOffFinding?.technicalDetails).toMatchObject({
      narrativeCodes: ["WO"],
      triggerFactSourceKind: FACT_SOURCE_KINDS.ACCOUNT_APPLIED_CODE,
      supportFactSourceKind: FACT_SOURCE_KINDS.GLOBAL_LEGEND_DEFINITION,
    });
  });

  it("does not create collection status or collection findings from legend-only TC", async () => {
    const parsed = parseAccount(accountHtml({ status: "Open", legend: "TC-Third party collection, AC-Account current/non-derogatory" }));

    expect(parsed.status).toBe("Open");
    expect(parsed.isCollectionAccount).toBe(false);
    expect(parsed.collectionAgencyMissingFromReport).toBe(false);

    const fieldNames = await detectorFieldsFromParsed(parsed);
    expect(fieldNames).not.toEqual(expect.arrayContaining(["dateAssignedToCollection", "collectionAgencyName"]));
  });

  it("still treats applied account-level TC as a collection turnover signal", async () => {
    const parsed = parseAccount(accountHtml({
      status: "Cancelled by Credit Grantor",
      narrative: "TC / CG",
      legend: "CG-Account cancelled by credit grantor with derogatory rating, TC-Third party collection/account turned over to collection agency",
    }));

    expect(parsed.isCollectionAccount).toBe(true);
    expect(parsed.collectionAgencyMissingFromReport).toBe(true);

    const fieldNames = await detectorFieldsFromParsed(parsed);
    expect(fieldNames).toEqual(expect.arrayContaining(["dateAssignedToCollection", "collectionAgencyName"]));
  });

  it("keeps colonless TransUnion legends out of sourceText stale-reporting and Metro 2 scans", () => {
    const legendOnlySource = `Status Open\nLegend ${TRANSUNION_LEGEND}`;

    expect(hasTerminalReportingStatus({ status: "Open", sourceText: legendOnlySource, notes: null })).toBe(false);
    expect(hasTerminalReportingStatus({ status: "Open", sourceText: `Narrative WO /\nLegend ${TRANSUNION_LEGEND}`, notes: null })).toBe(true);

    const balanceRule = Metro2Rules2025.rules.find((rule) => rule.ruleName === "BALANCE_PAST_DUE_CONSISTENCY");
    expect(balanceRule).toBeTruthy();
    expect(
      balanceRule?.validate({
        status: "WO-Write-off",
        accountType: "REVOLVING",
        currentBalance: 100,
        amountPastDue: 200,
      }).valid,
    ).toBe(false);
    expect(
      balanceRule?.validate({
        status: "Write-off",
        accountType: "REVOLVING",
        currentBalance: 100,
        amountPastDue: 200,
      }).valid,
    ).toBe(true);
  });
});
