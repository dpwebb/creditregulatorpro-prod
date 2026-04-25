import { Kysely } from "kysely";
import { DB } from "./schema";

/**
 * Seeds specialized debt rules for Medical Debt and Student Loans in Canada.
 * This includes statutes and specific versions with rules regarding reporting timelines,
 * waiting periods, and authorized reporters.
 */
export async function seedSpecializedDebtRules(db: Kysely<DB>): Promise<void> {
  // 1. Define the base statutes (jurisdiction + code only)
  const statutes = [
    {
      jurisdiction: "Federal",
      code: "MEDICAL-DEBT-CA",
    },
    {
      jurisdiction: "Federal",
      code: "NSLSC-DEFAULT",
    },
    {
      jurisdiction: "Federal",
      code: "STUDENT-LOAN-LIMIT",
    },
  ];

  // Insert statutes with onConflict to make idempotent
  for (const statute of statutes) {
    await db
      .insertInto("statute")
      .values(statute)
      .onConflict((oc) => oc.columns(["jurisdiction", "code"]).doNothing())
      .execute();
  }

  // 2. Retrieve IDs for the inserted statutes
  const medicalDebtStatute = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Federal")
    .where("code", "=", "MEDICAL-DEBT-CA")
    .executeTakeFirstOrThrow();

  const nslscDefaultStatute = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Federal")
    .where("code", "=", "NSLSC-DEFAULT")
    .executeTakeFirstOrThrow();

  const studentLoanLimitStatute = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Federal")
    .where("code", "=", "STUDENT-LOAN-LIMIT")
    .executeTakeFirstOrThrow();

  // 3. Define the statute versions with specific rules
  const statuteVersions = [
    // Medical Debt Rules
    {
      statuteId: medicalDebtStatute.id,
      version: 1,
      description:
        "Medical Debt Reporting Restrictions - 180-day waiting period and insurance verification requirements.",
      effectiveDate: new Date("2010-01-01"), // Approximate effective date for guidelines
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score/credit-report-score-basics.html",
      sectionReference: "Credit Reporting Guidelines - Medical Collections",
    },
    // NSLSC Default Reporting
    {
      statuteId: nslscDefaultStatute.id,
      version: 1,
      description:
        "NSLSC Default Reporting - 270-day default requirement before credit reporting.",
      effectiveDate: new Date("2000-08-01"), // CSLA effective dates vary, using a standard baseline
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.csnpe-nslsc.canada.ca/en/repayment/repaying-your-loan",
      sectionReference: "Canada Student Loans Act - Default Reporting",
    },
    // Student Loan Reporting Limitation
    {
      statuteId: studentLoanLimitStatute.id,
      version: 1,
      description:
        "Student Loan Negative Reporting Limitation - 6-year limit from date of last activity.",
      effectiveDate: new Date("2005-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score/information-credit-report.html",
      sectionReference: "Canadian Credit Reporting Guidelines - Education Debt",
    },
  ];

  // Insert statute versions with onConflict to make idempotent
  await db
    .insertInto("statuteVersion")
    .values(statuteVersions)
    .onConflict((oc) => oc.columns(["statuteId", "version"]).doNothing())
    .execute();
}