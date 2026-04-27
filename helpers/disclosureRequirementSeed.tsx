import { Kysely } from "kysely";
import { DB, DisclosureCategory } from "./schema";

export async function disclosureRequirementSeed(db: Kysely<DB>): Promise<void> {
  console.log("Starting disclosure requirement seed...");

  // 1. Ensure Federal PIPEDA statute exists, as it's required for federal disclosures
  let fedStatute = await db
    .selectFrom("statute")
    .where("jurisdiction", "=", "Federal")
    .where("code", "=", "PIPEDA")
    .select("id")
    .executeTakeFirst();

  if (!fedStatute) {
    console.log("Federal PIPEDA statute not found, creating...");
    const res = await db
      .insertInto("statute")
      .values({ jurisdiction: "Federal", code: "PIPEDA", region: "CA" })
      .returning("id")
      .executeTakeFirst();
      
    if (res) {
      await db
        .insertInto("statuteVersion")
        .values({
          statuteId: res.id,
          version: 1,
          effectiveDate: new Date("2001-01-01"),
          description: "Personal Information Protection and Electronic Documents Act",
          responseClockDays: 30,
        })
        .execute();
      fedStatute = { id: res.id };
    }
  }

  // 2. Fetch all statute versions
  const statutes = await db
    .selectFrom("statuteVersion")
    .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
    .select([
      "statuteVersion.id as versionId",
      "statute.jurisdiction",
      "statute.code",
    ])
    .execute();

  const abbrevMap: Record<string, string> = {
    "Ontario": "ON",
    "Nova Scotia": "NS",
    "Quebec": "QC",
    "Alberta": "AB",
    "British Columbia": "BC",
    "Manitoba": "MB",
    "Saskatchewan": "SK",
    "New Brunswick": "NB",
    "Prince Edward Island": "PE",
    "Newfoundland and Labrador": "NL",
    "Yukon": "YT",
    "Northwest Territories": "NT",
    "Nunavut": "NU",
    "Federal": "FED",
  };

  // 3. Define the template requirements
  const templateRequirements = [
    // IDENTITY
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-01", desc: "Consumer's full legal name", path: "consumer_profile.legal_name", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-02", desc: "Date of birth", path: "consumer_profile.date_of_birth", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-03", desc: "Current and previous addresses", path: "consumer_profile.address_history", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-04", desc: "Phone numbers", path: "consumer_profile.phone_history", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-05", desc: "Employment history", path: "consumer_profile.employment_history", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-06", desc: "SIN status indicator", path: "consumer_profile.sin_status_indicator", ref: "General Identity" },
    { cat: "IDENTITY" as DisclosureCategory, prefix: "ID-07", desc: "Aliases/former names", path: "consumer_profile.aliases", ref: "General Identity" },
    
    // CONTENT
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-01", desc: "All trade accounts/tradelines", path: "accounts", ref: "Report Content" },
        // Credit score presence is informational, not a statutory disclosure violation — removed from checks

    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-03", desc: "Payment history per account", path: "accounts[].payment_history", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-04", desc: "Account balances", path: "accounts[].balance", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-05", desc: "Account status", path: "accounts[].status", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-06", desc: "Inquiries (hard + soft)", path: "inquiries_credit_related", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-07", desc: "Public records/insolvency", path: "insolvency_public_records", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-08", desc: "Consumer statements", path: null, ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-09", desc: "High credit/credit limit", path: "accounts[].high_credit", ref: "Report Content" },
    { cat: "CONTENT" as DisclosureCategory, prefix: "CONT-10", desc: "Dates (opened, closed, reported, DOFD)", path: "accounts[].date_opened", ref: "Report Content" },
    
    // SOURCES
    { cat: "SOURCES" as DisclosureCategory, prefix: "SRC-01", desc: "Identify furnisher/creditor for each item", path: "accounts[].creditor_name", ref: "Source Identification" },
    { cat: "SOURCES" as DisclosureCategory, prefix: "SRC-02", desc: "Bureau identity and contact info", path: "bureau_context.bureau_name", ref: "Source Identification" },
    { cat: "SOURCES" as DisclosureCategory, prefix: "SRC-03", desc: "Report date and reference number", path: "bureau_context.report_generated_at", ref: "Source Identification" },
    
    // RIGHTS
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-01", desc: "Right to dispute inaccurate information", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-02", desc: "Right to add a consumer statement", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-03", desc: "Right to request investigation", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-04", desc: "Right to be notified of investigation results", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-05", desc: "Right to file complaint with provincial authority", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-06", desc: "Right to be informed of freeze/alert options", path: null, ref: "Consumer Rights" },
    { cat: "RIGHTS" as DisclosureCategory, prefix: "RGT-07", desc: "Right to free annual report access", path: null, ref: "Consumer Rights" },
  ];

  // 4. Generate rows for each statute version
  const rowsToInsert: any[] = [];

  for (const statute of statutes) {
    const provAbbrev = abbrevMap[statute.jurisdiction] || "UNK";
    const statCode = statute.code;
    
    // Add base templates
    for (const req of templateRequirements) {
      const code = `${provAbbrev}-${statCode}-${req.prefix}`;
      rowsToInsert.push({
        requirementCode: code,
        category: req.cat,
        description: req.desc,
        fieldPath: req.path,
        sectionReference: req.ref,
        severity: "ERROR",
        statuteVersionId: statute.versionId,
        metadata: JSON.stringify({ jurisdiction: statute.jurisdiction }),
      });
    }

    // Jurisdiction-specific nuances
    if (statute.jurisdiction === "Quebec") {
      rowsToInsert.push({
        requirementCode: `${provAbbrev}-${statCode}-RGT-08`,
        category: "RIGHTS" as DisclosureCategory,
        description: "Must provide disclosure in French upon request",
        fieldPath: null,
        sectionReference: "Language Rights",
        severity: "WARNING",
        statuteVersionId: statute.versionId,
        metadata: JSON.stringify({ languageRequirement: "fr-QC" }),
      });
    }

    if (statute.jurisdiction === "Federal") {
      rowsToInsert.push({
        requirementCode: `${provAbbrev}-${statCode}-RGT-09`,
        category: "RIGHTS" as DisclosureCategory,
        description: "Right to complain to Privacy Commissioner",
        fieldPath: null,
        sectionReference: "PIPEDA Complaints",
        severity: "INFO",
        statuteVersionId: statute.versionId,
        metadata: JSON.stringify({ federalOversight: true }),
      });
    }
  }

  // 5. Insert rows in chunks to avoid hitting parameter limits
  if (rowsToInsert.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize);
      await db
        .insertInto("disclosureRequirement")
        .values(chunk)
        .onConflict((oc) => oc.column("requirementCode").doNothing())
        .execute();
    }
  }

  console.log(`Successfully seeded ${rowsToInsert.length} disclosure requirements.`);
}