import { Kysely } from "kysely";
import { subYears, subMonths, startOfDay } from "./dateUtils";
import { DB, BankruptcyType, CanadianProvince, BankruptcyStatus } from "./schema";
import {
  calculateRetentionPeriod,
  calculateExpectedRemovalDate,
  getRetentionRuleDescription,
} from "./bankruptcyRules";

/**
 * Seeds the database with diverse sample bankruptcy and insolvency records.
 * This helper is used for demonstration and testing of retention tracking logic.
 */
export async function seedBankruptcyRecords(db: Kysely<DB>): Promise<void> {
  const now = startOfDay(new Date());

  const seedData = [
    {
      caseNumber: "BC-2022-001",
      type: "BANKRUPTCY_DISCHARGED" as BankruptcyType,
      province: "BC" as CanadianProvince,
      filingDate: subYears(now, 2),
      dischargeDate: subYears(now, 1),
      completionDate: null,
      isFirstTime: true,
      status: "DISCHARGED" as BankruptcyStatus,
      notes: "First-time bankruptcy in BC. Standard 6-year retention from discharge.",
    },
    {
      caseNumber: "ON-2019-002",
      type: "BANKRUPTCY_DISCHARGED" as BankruptcyType,
      province: "ON" as CanadianProvince,
      filingDate: subYears(now, 5),
      dischargeDate: subYears(now, 4),
      completionDate: null,
      isFirstTime: true,
      status: "DISCHARGED" as BankruptcyStatus,
      notes: "First-time bankruptcy in Ontario. Extended 7-year retention applies here.",
    },
    {
      caseNumber: "AB-2014-003",
      type: "BANKRUPTCY_DISCHARGED" as BankruptcyType,
      province: "AB" as CanadianProvince,
      filingDate: subYears(now, 10),
      dischargeDate: subYears(now, 9),
      completionDate: null,
      isFirstTime: false,
      status: "DISCHARGED" as BankruptcyStatus,
      notes: "Second-time bankruptcy in Alberta. 14-year retention from discharge.",
    },
    {
      caseNumber: "ON-CP-2020-004",
      type: "CONSUMER_PROPOSAL" as BankruptcyType,
      province: "ON" as CanadianProvince,
      filingDate: subYears(now, 4),
      dischargeDate: null,
      completionDate: subYears(now, 1),
      isFirstTime: true,
      status: "COMPLETED" as BankruptcyStatus,
      notes: "Consumer Proposal in Ontario. Removal is 3 years from completion (sooner than 6y from filing).",
    },
    {
      caseNumber: "BC-CP-2018-005",
      type: "CONSUMER_PROPOSAL" as BankruptcyType,
      province: "BC" as CanadianProvince,
      filingDate: subYears(now, 6),
      dischargeDate: null,
      completionDate: subMonths(now, 6),
      isFirstTime: true,
      status: "PENDING_REMOVAL" as BankruptcyStatus,
      notes: "Consumer Proposal in BC. 6 years from filing has passed, making it eligible for removal.",
    },
    {
      caseNumber: "QC-ACT-2023-006",
      type: "BANKRUPTCY_NOT_DISCHARGED" as BankruptcyType,
      province: "QC" as CanadianProvince,
      filingDate: subYears(now, 1),
      dischargeDate: null,
      completionDate: null,
      isFirstTime: true,
      status: "ACTIVE" as BankruptcyStatus,
      notes: "Active undischarged bankruptcy in Quebec. Remains indefinitely until discharge.",
    },
    {
      caseNumber: "ON-DIV1-2019-007",
      type: "DIVISION_I_PROPOSAL" as BankruptcyType,
      province: "ON" as CanadianProvince,
      filingDate: subYears(now, 5),
      dischargeDate: null,
      completionDate: subYears(now, 4),
      isFirstTime: true,
      status: "REMOVED" as BankruptcyStatus,
      notes: "Division I Proposal. 3 years from completion has passed. Should be removed from report.",
    },
  ];

  for (const item of seedData) {
    // Check if record already exists by case number to ensure idempotency
    const existing = await db
      .selectFrom("bankruptcyRecord")
      .select("id")
      .where("caseNumber", "=", item.caseNumber)
      .executeTakeFirst();

    if (existing) {
      console.log(`Bankruptcy record ${item.caseNumber} already exists, skipping.`);
      continue;
    }

    const retention = calculateRetentionPeriod(item.type, item.province, item.isFirstTime);
    const removalDate = calculateExpectedRemovalDate(
      item.filingDate,
      item.dischargeDate,
      item.completionDate,
      item.type,
      item.province,
      item.isFirstTime
    );

    // If removal date is null (indefinite), we use a far future date for the DB field
    const finalRemovalDate = removalDate || new Date("9999-12-31");

    await db
      .insertInto("bankruptcyRecord")
      .values({
        caseNumber: item.caseNumber,
        bankruptcyType: item.type,
        province: item.province,
        filingDate: item.filingDate,
        dischargeDate: item.dischargeDate,
        completionDate: item.completionDate,
        status: item.status,
        notes: item.notes,
        region: "CA",
        organizationId: null,
        userId: null,
        retentionYears: retention.years,
        retentionMonths: retention.months,
        retentionRuleDescription: getRetentionRuleDescription(item.type, item.province, item.isFirstTime),
        expectedRemovalDate: finalRemovalDate,
        equifaxReporting: true,
        transunionReporting: true,
      })
      .execute();
    
    console.log(`Seeded bankruptcy record: ${item.caseNumber}`);
  }
}