import { Kysely } from "kysely";
import { DB } from "./schema";

export async function seedIndustryStandards(db: Kysely<DB>): Promise<void> {
  const metro2Segments = {
    Header: { length: 426, required: true, description: "Header Record" },
    Base: {
      length: 426,
      required: true,
      description: "Base Segment - Consumer Data",
    },
    J1: {
      length: 426,
      required: false,
      description: "Associated Consumer - Same Address",
    },
    J2: {
      length: 426,
      required: false,
      description: "Associated Consumer - Different Address",
    },
    K1: {
      length: 426,
      required: false,
      description: "Original Creditor Name",
    },
    K2: {
      length: 426,
      required: false,
      description: "Purchased Portfolio/Sold To",
    },
    K3: {
      length: 426,
      required: false,
      description: "Mortgage Information",
    },
    K4: {
      length: 426,
      required: false,
      description: "Specialized Payment Information",
    },
    L1: {
      length: 426,
      required: false,
      description: "Change of Account Information",
    },
    N1: {
      length: 426,
      required: false,
      description: "Employment Information",
    },
    Trailer: { length: 426, required: true, description: "Trailer Record" },
  };

  const metro2FieldMappings = {
    "Base.ConsumerName": "user_account.display_name",
    "Base.ConsumerAddress": "user_account.address", // conceptual mapping
    "Base.SocialInsuranceNumber": "user_account.sin", // conceptual
    "Base.DateOfBirth": "user_account.dob",
    "Base.AccountStatus": "tradeline.status",
    "Base.CurrentBalance": "tradeline.balance",
    "Base.DateOpened": "tradeline.opened_date",
    "Base.AccountType": "tradeline.account_type",
    "Base.PaymentHistoryProfile": "tradeline.payment_history",
  };

  const metro2ValidationRules = {
    required_fields: [
      "Base.ConsumerName",
      "Base.ConsumerAddress",
      "Base.AccountStatus",
    ],
    format_checks: {
      DateOfBirth: "MMDDYYYY",
      DateOpened: "MMDDYYYY",
      CurrentBalance: "Numeric, whole dollars",
    },
    logic_checks: [
      {
        rule: "If AccountStatus is 11, CurrentBalance must be 0",
        severity: "Error",
      },
      {
        rule: "DateOpened cannot be in the future",
        severity: "Error",
      },
    ],
  };

  const standardsData = [
    {
      standardCode: "METRO2",
      standardName: "Metro 2® Format",
      description:
        "The standard format for reporting consumer credit information to credit bureaus in Canada and the US.",
      version: "2.1",
      effectiveDate: new Date("2021-01-01"),
      supersededDate: null,
      sourceUrl: "https://www.cdiaonline.org/resources/metro2/",
      documentationUrl:
        "https://www.cdiaonline.org/wp-content/uploads/2021/01/Metro2-Format-2021.pdf",
      region: "CA",
      segmentDefinitions: metro2Segments,
      fieldMappings: metro2FieldMappings,
      validationRules: metro2ValidationRules,
      metadata: {
        maintainer: "Consumer Data Industry Association (CDIA)",
        is_current: true,
      },
    },
    {
      standardCode: "METRO2",
      standardName: "Metro 2® Format",
      description:
        "Previous version of the standard format for reporting consumer credit information.",
      version: "2.0",
      effectiveDate: new Date("2015-01-01"),
      supersededDate: new Date("2021-01-01"),
      sourceUrl: "https://www.cdiaonline.org/resources/metro2/",
      documentationUrl:
        "https://www.cdiaonline.org/wp-content/uploads/2015/01/Metro2-Format-2015.pdf",
      region: "CA",
      segmentDefinitions: metro2Segments, // Simplified: reusing same segments for seed
      fieldMappings: metro2FieldMappings,
      validationRules: metro2ValidationRules,
      metadata: {
        maintainer: "Consumer Data Industry Association (CDIA)",
        is_current: false,
        deprecation_reason: "Updated compliance requirements",
      },
    },
  ];

  // Attempt to insert standards.
  // Assuming unique constraint on (standardCode, version).
  await db
    .insertInto("industryStandard")
    .values(standardsData)
    .onConflict((oc) => oc.columns(["standardCode", "version"]).doNothing())
    .execute();

  console.log("Seeded industry standard data.");
}