import { Kysely } from "kysely";
import { DB } from "./schema";

export async function seedFederalGuidance(db: Kysely<DB>): Promise<void> {
  const guidanceData = [
    {
      guidanceCode: "CG-3",
      title: "Guideline on Credit Reporting",
      description:
        "FCAC guideline setting out expectations for federally regulated financial institutions regarding credit reporting practices, accuracy, and dispute resolution.",
      version: 1,
      effectiveDate: new Date("2023-01-01"),
      supersededDate: null,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/services/industry/commissioner-guidance/guideline-credit-reporting.html",
      sectionReference: "Section 4.1 (Accuracy)",
      region: "CA",
      metadata: {
        authority: "Financial Consumer Agency of Canada",
        enforcement_level: "mandatory",
        tags: ["accuracy", "disputes", "consumer-rights"],
      },
    },
    {
      guidanceCode: "FCAC-CR-ACCESS",
      title: "Consumer Rights: Access to Credit Reports",
      description:
        "Guidelines ensuring consumers have free and timely access to their credit reports and scores from the major credit bureaus.",
      version: 1,
      effectiveDate: new Date("2022-06-15"),
      supersededDate: null,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score/order-credit-report.html",
      sectionReference: "Access Rights",
      region: "CA",
      metadata: {
        authority: "Financial Consumer Agency of Canada",
        tags: ["access", "transparency"],
      },
    },
    {
      guidanceCode: "FCAC-DISPUTE-PROC",
      title: "Dispute Resolution Procedures for Credit Reporting",
      description:
        "Framework for handling consumer disputes regarding inaccurate information on credit reports, including timelines and escalation paths.",
      version: 2,
      effectiveDate: new Date("2023-09-01"),
      supersededDate: null,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score/correct-errors.html",
      sectionReference: "Step 2: Dispute with Credit Bureau",
      region: "CA",
      metadata: {
        authority: "Financial Consumer Agency of Canada",
        response_sla_days: 30,
        tags: ["dispute", "resolution", "timelines"],
      },
    },
    {
      guidanceCode: "FCAC-SUPERVISION",
      title: "FCAC Supervision Framework",
      description:
        "Framework outlining FCAC's approach to supervising financial institutions to ensure compliance with consumer protection measures and market conduct obligations.",
      version: 1,
      effectiveDate: new Date("2023-04-01"),
      supersededDate: null,
      sourceUrl:
        "https://www.canada.ca/en/financial-consumer-agency/programs/research/supervision-framework.html",
      sectionReference: null,
      region: "CA",
      metadata: {
        agency: "FCAC",
        category: "supervision",
        applies_to: ["banks", "credit_unions", "trust_companies"],
      },
    },
    {
      guidanceCode: "OSFI-B20",
      title:
        "OSFI Guideline B-20: Residential Mortgage Underwriting Practices and Procedures",
      description:
        "Guideline establishing minimum standards for residential mortgage underwriting practices and procedures, including stress testing and loan-to-value limits.",
      version: 4,
      effectiveDate: new Date("2024-07-01"),
      supersededDate: null,
      sourceUrl:
        "https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-b-20-residential-mortgage-underwriting-practices-and-procedures",
      sectionReference: null,
      region: "CA",
      metadata: {
        agency: "OSFI",
        category: "prudential",
        guideline_type: "sound_business_practice",
        applies_to: ["mortgage_lenders"],
      },
    },
    {
      guidanceCode: "OSFI-B20",
      title:
        "OSFI Guideline B-20: Residential Mortgage Underwriting Practices and Procedures",
      description:
        "Guideline establishing minimum standards for residential mortgage underwriting practices and procedures, including stress testing and loan-to-value limits.",
      version: 3,
      effectiveDate: new Date("2021-06-01"),
      supersededDate: new Date("2024-07-01"),
      sourceUrl:
        "https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-b-20-residential-mortgage-underwriting-practices-and-procedures",
      sectionReference: null,
      region: "CA",
      metadata: {
        agency: "OSFI",
        category: "prudential",
        guideline_type: "sound_business_practice",
        superseded_by_version: 4,
      },
    },
    {
      guidanceCode: "OSFI-IFRS9",
      title: "OSFI IFRS 9 Financial Instruments - Implementation Guidance",
      description:
        "Guidance on implementing IFRS 9 Financial Instruments standard in Canada, covering classification, measurement, impairment, and hedge accounting for credit portfolios.",
      version: 1,
      effectiveDate: new Date("2018-01-01"),
      supersededDate: null,
      sourceUrl:
        "https://www.osfi-bsif.gc.ca/en/supervision/banks/accounting/international-financial-reporting-standards-ifrs",
      sectionReference: "IFRS 9",
      region: "CA",
      metadata: {
        agency: "OSFI",
        category: "accounting",
        standard: "IFRS_9",
        key_topics: [
          "expected_credit_loss",
          "impairment_model",
          "classification_measurement",
        ],
      },
    },
  ];

  // We attempt to insert. If a unique constraint on (guidanceCode, version) exists, we skip.
  // Note: If the DB schema doesn't strictly enforce this unique constraint, this might insert duplicates.
  // Ideally, we would check for existence first or rely on a known unique index.
  // Assuming a logical unique key on guidanceCode + version.
  await db
    .insertInto("federalGuidance")
    .values(guidanceData)
    .onConflict((oc) => oc.columns(["guidanceCode", "version"]).doNothing())
    .execute();

  console.log("Seeded federal guidance data.");
}