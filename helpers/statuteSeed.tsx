import { Kysely } from "kysely";
import { DB } from "./schema";

export async function seedStatutes(db: Kysely<DB>): Promise<void> {
  // First, define the base statutes (jurisdiction + code only)
  const statutes = [
    {
      jurisdiction: "Ontario",
      code: "CRA",
    },
    {
      jurisdiction: "Nova Scotia",
      code: "CRA",
    },
    {
      jurisdiction: "Quebec",
      code: "A-8.2",
    },
    {
      jurisdiction: "Alberta",
      code: "PIPA",
    },
    {
      jurisdiction: "British Columbia",
      code: "CRA",
    },
    {
      jurisdiction: "Manitoba",
      code: "CPA",
    },
    {
      jurisdiction: "Saskatchewan",
      code: "CPBPA",
    },
    {
      jurisdiction: "New Brunswick",
      code: "CRA",
    },
    {
      jurisdiction: "Prince Edward Island",
      code: "CRA",
    },
    {
      jurisdiction: "Newfoundland and Labrador",
      code: "CPBPA",
    },
    {
      jurisdiction: "Yukon",
      code: "CPA",
    },
    {
      jurisdiction: "Northwest Territories",
      code: "CPA",
    },
    {
      jurisdiction: "Nunavut",
      code: "CPA",
    },
  ];

  // Insert statutes with onConflict to make idempotent
  for (const statute of statutes) {
    await db
      .insertInto("statute")
      .values(statute)
      .onConflict((oc) =>
        oc.columns(["jurisdiction", "code"]).doNothing()
      )
      .execute();
  }

  // Now get the statute IDs for inserting versions
  const ontarioCRA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Ontario")
    .where("code", "=", "CRA")
    .executeTakeFirstOrThrow();

  const novaScotiaCRA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Nova Scotia")
    .where("code", "=", "CRA")
    .executeTakeFirstOrThrow();

  const quebecA82 = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Quebec")
    .where("code", "=", "A-8.2")
    .executeTakeFirstOrThrow();

  const albertaPIPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Alberta")
    .where("code", "=", "PIPA")
    .executeTakeFirstOrThrow();

  const bcCRA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "British Columbia")
    .where("code", "=", "CRA")
    .executeTakeFirstOrThrow();

  const manitobaCPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Manitoba")
    .where("code", "=", "CPA")
    .executeTakeFirstOrThrow();

  const saskatchewanCPBPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Saskatchewan")
    .where("code", "=", "CPBPA")
    .executeTakeFirstOrThrow();

  const newBrunswickCRA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "New Brunswick")
    .where("code", "=", "CRA")
    .executeTakeFirstOrThrow();

  const peiCRA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Prince Edward Island")
    .where("code", "=", "CRA")
    .executeTakeFirstOrThrow();

  const nfldCPBPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Newfoundland and Labrador")
    .where("code", "=", "CPBPA")
    .executeTakeFirstOrThrow();

  const yukonCPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Yukon")
    .where("code", "=", "CPA")
    .executeTakeFirstOrThrow();

  const nwtCPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Northwest Territories")
    .where("code", "=", "CPA")
    .executeTakeFirstOrThrow();

  const nunavutCPA = await db
    .selectFrom("statute")
    .select("id")
    .where("jurisdiction", "=", "Nunavut")
    .where("code", "=", "CPA")
    .executeTakeFirstOrThrow();

  // Define the statute versions with all version-specific data
  const statuteVersions = [
    {
      statuteId: ontarioCRA.id,
      version: 1,
      description: "Ontario Consumer Reporting Act",
      effectiveDate: new Date("1990-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.ontario.ca/laws/statute/90c33",
      sectionReference: "R.S.O. 1990, c. C.33",
    },
    {
      statuteId: novaScotiaCRA.id,
      version: 1,
      description: "Nova Scotia Consumer Reporting Act",
      effectiveDate: new Date("1989-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://nslegislature.ca/legc/bills/rulesstatutes/statutes/consumers/consumr.htm",
      sectionReference: "s. 13 (Protests)",
    },
    {
      statuteId: quebecA82.id,
      version: 1,
      description: "Quebec Act respecting the protection of personal information in the private sector",
      effectiveDate: new Date("2002-01-01"),
      supersededDate: null,
      responseClockDays: 60,
      sourceUrl: "https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1",
      sectionReference: "R.S.Q., c. P-39.1",
    },
    {
      statuteId: albertaPIPA.id,
      version: 1,
      description: "Alberta Personal Information Protection Act",
      effectiveDate: new Date("2004-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.alberta.ca/personal-information-protection-act",
      sectionReference: "S.A. 2003, c. P-6.5",
    },
    {
      statuteId: bcCRA.id,
      version: 1,
      description: "British Columbia Consumer Reporting Act",
      effectiveDate: new Date("1997-07-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96082_01",
      sectionReference: "R.S.B.C. 1996, c. 82",
    },
    {
      statuteId: manitobaCPA.id,
      version: 1,
      description: "Manitoba Consumer Protection Act",
      effectiveDate: new Date("2006-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/c200e.php",
      sectionReference: "C.C.S.M. c. C200",
    },
    {
      statuteId: saskatchewanCPBPA.id,
      version: 1,
      description: "Saskatchewan Consumer Protection and Business Practices Act",
      effectiveDate: new Date("2014-09-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.canlii.org/en/sk/laws/stat/ss-2014-c-c-30.2/latest/",
      sectionReference: "S.S. 2014, c. C-30.2",
    },
    {
      statuteId: newBrunswickCRA.id,
      version: 1,
      description: "New Brunswick Consumer Reporting Act",
      effectiveDate: new Date("2009-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.canlii.org/en/nb/laws/stat/snb-2009-c-c-17.3/latest/",
      sectionReference: "S.N.B. 2009, c. C-17.3",
    },
    {
      statuteId: peiCRA.id,
      version: 1,
      description: "Prince Edward Island Consumer Reporting Act",
      effectiveDate: new Date("1989-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.princeedwardisland.ca/en/legislation/consumer-reporting-act",
      sectionReference: "R.S.P.E.I. 1988, c. C-22",
    },
    {
      statuteId: nfldCPBPA.id,
      version: 1,
      description: "Newfoundland and Labrador Consumer Protection and Business Practices Act",
      effectiveDate: new Date("2009-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.assembly.nl.ca/Legislation/sr/statutes/c09-02.htm",
      sectionReference: "S.N.L. 2009, c. C-09.2",
    },
    {
      statuteId: yukonCPA.id,
      version: 1,
      description: "Yukon Consumer Protection Act",
      effectiveDate: new Date("2002-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0040/2002-0040.pdf",
      sectionReference: "R.S.Y. 2002, c. 40",
    },
    {
      statuteId: nwtCPA.id,
      version: 1,
      description: "Northwest Territories Consumer Protection Act",
      effectiveDate: new Date("2008-01-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.justice.gov.nt.ca/en/files/legislation/consumer-protection/consumer-protection.a.pdf",
      sectionReference: "S.N.W.T. 2007, c. 23",
    },
    {
      statuteId: nunavutCPA.id,
      version: 1,
      description: "Nunavut Consumer Protection Act",
      effectiveDate: new Date("1999-04-01"),
      supersededDate: null,
      responseClockDays: 30,
      sourceUrl: "https://www.canlii.org/en/nu/laws/stat/rsnwt-nu-1988-c-c-17/latest/",
      sectionReference: "R.S.N.W.T. (Nu.) 1988, c. C-17",
    },
  ];

  // Insert statute versions with onConflict to make idempotent
  await db
    .insertInto("statuteVersion")
    .values(statuteVersions)
    .onConflict((oc) =>
      oc.columns(["statuteId", "version"]).doNothing()
    )
    .execute();
}