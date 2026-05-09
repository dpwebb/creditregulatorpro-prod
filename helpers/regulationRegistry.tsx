import { ViolationCategory, CanadianProvince } from "./schema";
import styles from "./regulationRegistry.module.css";

export interface RegulationEntry {
  id: string;
  statute: string;
  citation: string;
  shortLabel: string;
  description: string;
  violationCategories: ViolationCategory[];
  authorityType?: "statute" | "privacy_principle" | "reporting_standard" | "procedural_rule" | "local_registry_entry";
  sourceQuality?: "official" | "private_standard" | "local_registry";
  supportLevel?: "field_requirement" | "category_principle" | "procedural_requirement" | "reporting_standard" | "registry_placeholder";
  jurisdiction?: string;
  province?: CanadianProvince;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
  fieldNames?: string[];
  accountTypes?: string[];
  allowsFieldRequiredLanguage?: boolean;
}

type ProvincialAuthorityMapping = {
  statuteName: string;
  creditReportingSourceUrl: string;
  collectionStatuteName: string;
  collectionSourceUrl: string;
  limitationsStatuteName: string;
  limitationsSourceUrl: string;
  sections: {
    accuracy: string;
    corroboration: string;
    reportingLimit: string;
    bankruptcy: string;
    identityTheft: string;
    dispute: string;
    collection: string;
    disclosure: string;
    bureauObligations: string;
    permissiblePurpose: string;
  };
};

const PROVINCIAL_CRA_MAPPING: Record<CanadianProvince, ProvincialAuthorityMapping> = {
  ON: {
    statuteName: "Ontario Consumer Reporting Act",
    creditReportingSourceUrl: "https://www.ontario.ca/laws/statute/90c33",
    collectionStatuteName: "Ontario Collection and Debt Settlement Services Act",
    collectionSourceUrl: "https://www.ontario.ca/laws/statute/90c14",
    limitationsStatuteName: "Ontario Limitations Act, 2002",
    limitationsSourceUrl: "https://www.ontario.ca/laws/statute/02l24",
    sections: {
      accuracy: "R.S.O. 1990, c. C.33, s. 9(3)(a)",
      corroboration: "R.S.O. 1990, c. C.33, s. 9(3)(b)",
      reportingLimit: "R.S.O. 1990, c. C.33, s. 9(3)(f)(i)",
      bankruptcy: "R.S.O. 1990, c. C.33, s. 9(3)(e)",
      identityTheft: "R.S.O. 1990, c. C.33, s. 12.1(1)",
      dispute: "R.S.O. 1990, c. C.33, s. 13",
      collection: "R.S.O. 1990, c. C.14",
      disclosure: "R.S.O. 1990, c. C.33, s. 12",
      bureauObligations: "R.S.O. 1990, c. C.33, s. 9",
      permissiblePurpose: "R.S.O. 1990, c. C.33, s. 8",
    },
  },
  BC: {
    statuteName: "BC Business Practices and Consumer Protection Act",
    creditReportingSourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_00_multi",
    collectionStatuteName: "BC Business Practices and Consumer Protection Act",
    collectionSourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_00_multi",
    limitationsStatuteName: "BC Limitation Act",
    limitationsSourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/12013_01",
    sections: {
      accuracy: "S.B.C. 2004, c. 2, s. 109(1)",
      corroboration: "S.B.C. 2004, c. 2, s. 109(2)",
      reportingLimit: "S.B.C. 2004, c. 2, s. 19.13(2)",
      bankruptcy: "S.B.C. 2004, c. 2, s. 109(1)(e)",
      identityTheft: "S.B.C. 2004, c. 2, s. 111.1",
      dispute: "S.B.C. 2004, c. 2, s. 111",
      collection: "S.B.C. 2004, c. 2, Part 7",
      disclosure: "S.B.C. 2004, c. 2, s. 107",
      bureauObligations: "S.B.C. 2004, c. 2, s. 109",
      permissiblePurpose: "S.B.C. 2004, c. 2, s. 108",
    },
  },
  AB: {
    statuteName: "Alberta Consumer Protection Act",
    creditReportingSourceUrl: "https://kings-printer.alberta.ca/1266.cfm?page=c26p3.cfm&leg_type=Acts&isbncln=978",
    collectionStatuteName: "Alberta Consumer Protection Act",
    collectionSourceUrl: "https://kings-printer.alberta.ca/1266.cfm?page=c26p3.cfm&leg_type=Acts&isbncln=978",
    limitationsStatuteName: "Alberta Limitations Act",
    limitationsSourceUrl: "https://kings-printer.alberta.ca/1266.cfm?page=L12.cfm&leg_type=Acts&isbncln=978",
    sections: {
      accuracy: "R.S.A. 2000, c. C-26.3, Part 5",
      corroboration: "R.S.A. 2000, c. C-26.3, Part 5",
      reportingLimit: "R.S.A. 2000, c. C-26.3, Part 5",
      bankruptcy: "R.S.A. 2000, c. C-26.3, Part 5",
      identityTheft: "R.S.A. 2000, c. C-26.3, Part 5",
      dispute: "R.S.A. 2000, c. C-26.3, Part 5",
      collection: "R.S.A. 2000, c. C-26.3, Part 8",
      disclosure: "R.S.A. 2000, c. C-26.3, Part 5",
      bureauObligations: "R.S.A. 2000, c. C-26.3, Part 5",
      permissiblePurpose: "R.S.A. 2000, c. C-26.3, Part 5",
    },
  },
  QC: {
    statuteName: "Quebec Credit Assessment Agents Act",
    creditReportingSourceUrl: "https://www.legisquebec.gouv.qc.ca/en/ShowDoc/cs/A-8.2",
    collectionStatuteName: "Quebec Act respecting the collection of certain debts",
    collectionSourceUrl: "https://www.legisquebec.gouv.qc.ca/en/ShowDoc/cs/R-2.2",
    limitationsStatuteName: "Civil Code of Quebec",
    limitationsSourceUrl: "https://www.legisquebec.gouv.qc.ca/en/ShowDoc/cs/CCQ-1991",
    sections: {
      accuracy: "CQLR c. A-8.2, ss. 13-23",
      corroboration: "CQLR c. A-8.2, ss. 13-23",
      reportingLimit: "CQLR c. A-8.2, ss. 13-23",
      bankruptcy: "CQLR c. A-8.2, ss. 13-23",
      identityTheft: "CQLR c. A-8.2, ss. 8-12",
      dispute: "CQLR c. A-8.2, ss. 24-27",
      collection: "CQLR c. R-2.2",
      disclosure: "CQLR c. A-8.2, ss. 13-23",
      bureauObligations: "CQLR c. A-8.2, ss. 35-47",
      permissiblePurpose: "CQLR c. A-8.2, ss. 13-23",
    },
  },
  SK: {
    statuteName: "Saskatchewan Credit Reporting Act",
    creditReportingSourceUrl: "https://pubsaskdev.blob.core.windows.net/pubsask-prod/archived/14015/C43-2.pdf",
    collectionStatuteName: "Saskatchewan Collection Agents Act",
    collectionSourceUrl: "https://fcaa.gov.sk.ca/regulated-businesses-persons/persons/collection-agents",
    limitationsStatuteName: "Saskatchewan Limitations Act",
    limitationsSourceUrl: "https://www.saskatchewan.ca/government/government-structure/ministries/justice",
    sections: {
      accuracy: "S.S. 2004, c. C-43.2, Part III",
      corroboration: "S.S. 2004, c. C-43.2, Part III",
      reportingLimit: "S.S. 2004, c. C-43.2, s. 22",
      bankruptcy: "S.S. 2004, c. C-43.2, s. 22",
      identityTheft: "S.S. 2004, c. C-43.2, Part III",
      dispute: "S.S. 2004, c. C-43.2, Part III",
      collection: "The Collection Agents Act",
      disclosure: "S.S. 2004, c. C-43.2, Part III",
      bureauObligations: "S.S. 2004, c. C-43.2, Part III",
      permissiblePurpose: "S.S. 2004, c. C-43.2, Part III",
    },
  },
  MB: {
    statuteName: "Manitoba Consumer Protection Act",
    creditReportingSourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/c200e.php",
    collectionStatuteName: "Manitoba Consumer Protection Act",
    collectionSourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/c200e.php",
    limitationsStatuteName: "Manitoba Limitations Act",
    limitationsSourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/l150e.php",
    sections: {
      accuracy: "C.C.S.M. c. C200, Part XIII",
      corroboration: "C.C.S.M. c. C200, Part XIII",
      reportingLimit: "C.C.S.M. c. C200, s. 103(1)",
      bankruptcy: "C.C.S.M. c. C200, s. 103(1)",
      identityTheft: "C.C.S.M. c. C200, Part XIII",
      dispute: "C.C.S.M. c. C200, Part XIII",
      collection: "C.C.S.M. c. C200 Part XII",
      disclosure: "C.C.S.M. c. C200, Part XIII",
      bureauObligations: "C.C.S.M. c. C200, Part XIII",
      permissiblePurpose: "C.C.S.M. c. C200, Part XIII",
    },
  },
  NB: {
    statuteName: "New Brunswick Consumer Protection Act",
    creditReportingSourceUrl: "https://laws.gnb.ca/en/document/cs/2024%2C%20c.1",
    collectionStatuteName: "New Brunswick Consumer Protection Act",
    collectionSourceUrl: "https://laws.gnb.ca/en/document/cs/2024%2C%20c.1",
    limitationsStatuteName: "New Brunswick Limitation of Actions Act",
    limitationsSourceUrl: "https://laws.gnb.ca/en/document/cs/L-8.5",
    sections: {
      accuracy: "S.N.B. 2024, c. 1, ss. 252-263",
      corroboration: "S.N.B. 2024, c. 1, ss. 252-263",
      reportingLimit: "S.N.B. 2024, c. 1, s. 254",
      bankruptcy: "S.N.B. 2024, c. 1, s. 254",
      identityTheft: "S.N.B. 2024, c. 1, s. 263",
      dispute: "S.N.B. 2024, c. 1, s. 261",
      collection: "S.N.B. 2024, c. 1",
      disclosure: "S.N.B. 2024, c. 1, s. 260",
      bureauObligations: "S.N.B. 2024, c. 1, ss. 252-263",
      permissiblePurpose: "S.N.B. 2024, c. 1, s. 253",
    },
  },
  NS: {
    statuteName: "Nova Scotia Consumer Reporting Act",
    creditReportingSourceUrl: "https://nslegislature.ca/legc/bills/rulesstatutes/statutes/consumers/consumr.htm",
    collectionStatuteName: "Nova Scotia Collection and Debt Management Agencies Act",
    collectionSourceUrl: "https://nslegislature.ca/legc/statutes/collection%20and%20debt%20management%20agencies.pdf",
    limitationsStatuteName: "Nova Scotia Limitation of Actions Act",
    limitationsSourceUrl: "https://nslegislature.ca/legc/statutes/limitation%20of%20actions.pdf",
    sections: {
      accuracy: "R.S.N.S. 1989, c. 93, s. 9(3)(a)",
      corroboration: "R.S.N.S. 1989, c. 93, s. 9(3)(b)",
      reportingLimit: "R.S.N.S. 1989, c. 93, s. 9(3)(f)",
      bankruptcy: "R.S.N.S. 1989, c. 93, s. 9(3)(e)",
      identityTheft: "R.S.N.S. 1989, c. 93, s. 12A",
      dispute: "R.S.N.S. 1989, c. 93, s. 13",
      collection: "R.S.N.S. 1989, c. 77",
      disclosure: "R.S.N.S. 1989, c. 93, s. 11",
      bureauObligations: "R.S.N.S. 1989, c. 93, s. 9",
      permissiblePurpose: "R.S.N.S. 1989, c. 93, s. 8",
    },
  },
  PE: {
    statuteName: "Prince Edward Island Consumer Reporting Act",
    creditReportingSourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/C-20-Consumer%20Reporting%20Act.pdf",
    collectionStatuteName: "Prince Edward Island Collection Agencies Act",
    collectionSourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/c-11-collection_agencies_act.pdf",
    limitationsStatuteName: "Prince Edward Island Statute of Limitations",
    limitationsSourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/s-07-statute_of_limitations.pdf",
    sections: {
      accuracy: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(a)",
      corroboration: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(b)",
      reportingLimit: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(f)",
      bankruptcy: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(e)",
      identityTheft: "R.S.P.E.I. 1988, c. C-20, s. 10",
      dispute: "R.S.P.E.I. 1988, c. C-20, s. 14",
      collection: "R.S.P.E.I. 1988, c. C-11",
      disclosure: "R.S.P.E.I. 1988, c. C-20, s. 12",
      bureauObligations: "R.S.P.E.I. 1988, c. C-20, s. 10",
      permissiblePurpose: "R.S.P.E.I. 1988, c. C-20, s. 8",
    },
  },
  NL: {
    statuteName: "Newfoundland and Labrador Consumer Reporting Agencies Act",
    creditReportingSourceUrl: "https://www.assembly.nl.ca/Legislation/sr/statutes/c09-02.htm",
    collectionStatuteName: "Newfoundland and Labrador Collections Act",
    collectionSourceUrl: "https://www.assembly.nl.ca/legislation/sr/statutes/c22.htm",
    limitationsStatuteName: "Newfoundland and Labrador Limitations Act",
    limitationsSourceUrl: "https://assembly.nl.ca/Legislation/sr/statutes/l16-1.htm",
    sections: {
      accuracy: "R.S.N.L. 1990, c. C-32, s. 10(3)(a)",
      corroboration: "R.S.N.L. 1990, c. C-32, s. 10(3)(b)",
      reportingLimit: "R.S.N.L. 1990, c. C-32, s. 10(3)(f)",
      bankruptcy: "R.S.N.L. 1990, c. C-32, s. 10(3)(e)",
      identityTheft: "R.S.N.L. 1990, c. C-32, s. 10",
      dispute: "R.S.N.L. 1990, c. C-32, s. 14",
      collection: "R.S.N.L. 1990, c. C-22",
      disclosure: "R.S.N.L. 1990, c. C-32, s. 12",
      bureauObligations: "R.S.N.L. 1990, c. C-32, s. 10",
      permissiblePurpose: "R.S.N.L. 1990, c. C-32, s. 8",
    },
  },
  NT: {
    statuteName: "Northwest Territories Consumer Protection Act",
    creditReportingSourceUrl: "https://www.justice.gov.nt.ca/en/files/legislation/consumer-protection/consumer-protection.a.pdf",
    collectionStatuteName: "Northwest Territories Consumer Protection Act",
    collectionSourceUrl: "https://www.justice.gov.nt.ca/en/files/legislation/consumer-protection/consumer-protection.r2.pdf",
    limitationsStatuteName: "Northwest Territories Limitation of Actions Act",
    limitationsSourceUrl: "https://www.justice.gov.nt.ca/en/files/legislation/limitation-of-actions/limitation-of-actions.a.pdf",
    sections: {
      accuracy: "R.S.N.W.T. 1988, c. C-17",
      corroboration: "R.S.N.W.T. 1988, c. C-17",
      reportingLimit: "R.S.N.W.T. 1988, c. C-17",
      bankruptcy: "R.S.N.W.T. 1988, c. C-17",
      identityTheft: "R.S.N.W.T. 1988, c. C-17",
      dispute: "R.S.N.W.T. 1988, c. C-17",
      collection: "Consumer Protection Regulations, Debt Collection Practices",
      disclosure: "R.S.N.W.T. 1988, c. C-17",
      bureauObligations: "R.S.N.W.T. 1988, c. C-17",
      permissiblePurpose: "R.S.N.W.T. 1988, c. C-17",
    },
  },
  NU: {
    statuteName: "Nunavut Consumer Protection Act",
    creditReportingSourceUrl: "https://www.nunavutlegislation.ca/en/consolidated-law/current?title=C",
    collectionStatuteName: "Nunavut Consumer Protection Act",
    collectionSourceUrl: "https://www.nunavutlegislation.ca/en/consolidated-law/current?title=C",
    limitationsStatuteName: "Nunavut Limitation of Actions Act",
    limitationsSourceUrl: "https://www.nunavutlegislation.ca/en/consolidated-law/current?title=L",
    sections: {
      accuracy: "C.S.Nu., c. C-160",
      corroboration: "C.S.Nu., c. C-160",
      reportingLimit: "R.S.N.W.T. (Nu) 1988, c. C-17",
      bankruptcy: "C.S.Nu., c. C-160",
      identityTheft: "C.S.Nu., c. C-160",
      dispute: "C.S.Nu., c. C-160",
      collection: "C.S.Nu., c. C-160",
      disclosure: "C.S.Nu., c. C-160",
      bureauObligations: "C.S.Nu., c. C-160",
      permissiblePurpose: "C.S.Nu., c. C-160",
    },
  },
  YT: {
    statuteName: "Yukon Consumers Protection Act",
    creditReportingSourceUrl: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0040/2002-0040.pdf",
    collectionStatuteName: "Yukon Consumers Protection Act",
    collectionSourceUrl: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0040/2002-0040.pdf",
    limitationsStatuteName: "Yukon Limitation of Actions Act",
    limitationsSourceUrl: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2002/2002-0139/2002-0139.pdf",
    sections: {
      accuracy: "R.S.Y. 2002, c. 40",
      corroboration: "R.S.Y. 2002, c. 40",
      reportingLimit: "R.S.Y. 2002, c. 40",
      bankruptcy: "R.S.Y. 2002, c. 40",
      identityTheft: "R.S.Y. 2002, c. 40",
      dispute: "R.S.Y. 2002, c. 40",
      collection: "R.S.Y. 2002, c. 40",
      disclosure: "R.S.Y. 2002, c. 40",
      bureauObligations: "R.S.Y. 2002, c. 40",
      permissiblePurpose: "R.S.Y. 2002, c. 40",
    },
  },
};

const pipedaEntries: Record<string, RegulationEntry> = {
  PIPEDA_4_3: {
    id: "PIPEDA_4_3",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.3",
    shortLabel: "Consent",
    description:
      "The knowledge and consent of the individual are required for the collection, use, or disclosure of personal information, except where inappropriate.",
    violationCategories: [
      "BUREAU_ACCESS_VIOLATION",
      "IDENTITY_THEFT_VIOLATION",
      "FURNISHER_JOINT_ACCOUNT_VIOLATION",
      "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION",
    ],
  },
  PIPEDA_4_3_8: {
    id: "PIPEDA_4_3_8",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.3.8",
    shortLabel: "Consent Withdrawal",
    description:
      "An individual may withdraw consent at any time, subject to legal or contractual restrictions and reasonable notice, and the organization must inform the individual of the implications.",
    violationCategories: ["CONSENT_WITHDRAWAL_NOT_HONORED"],
  },
  PIPEDA_4_5: {
    id: "PIPEDA_4_5",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.5",
    shortLabel: "Limiting Use",
    description:
      "Personal information shall be retained only as long as necessary for the fulfilment of those purposes.",
    violationCategories: ["STATUTE_OF_LIMITATIONS", "STATUTE_APPROACHING"],
  },
  PIPEDA_4_6: {
    id: "PIPEDA_4_6",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.6",
    shortLabel: "Accuracy",
    description:
      "Personal information shall be as accurate, complete, and up-to-date as is necessary for the purposes for which it is to be used.",
    violationCategories: [
      "STALE_REPORTING_FAILURE",
      "DOCUMENTATION_CHAIN_FAILURE",
      "BALANCE_CALCULATION_VIOLATION",
      "FURNISHER_REAGING_VIOLATION",
      "TEMPORAL_MANIPULATION",
      "RETROACTIVE_HISTORY_MANIPULATION",
      "LAST_ACTIVITY_DATE_MANIPULATION",
      "DATE_LOGIC_IMPOSSIBLE",
      "ACCOUNT_STATUS_INCONSISTENCY",
      "FURNISHER_STATUS_CODE_MISMATCH",
      "PAYMENT_HISTORY_MANIPULATION",
      "CREDIT_LIMIT_MANIPULATION",
      "CLOSED_ACCOUNT_BALANCE_INFLATION",
      "CROSS_ENTITY_DISCREPANCY",
      "CROSS_BUREAU_INCONSISTENCY",
      "ZOMBIE_DEBT_RESURRECTION",
      "PHANTOM_DEBT_UNVERIFIABLE",
      "COLLECTOR_UNAUTHORIZED_FEES",
      "COLLECTOR_DUPLICATE_REPORTING",
      "MULTIPLE_COLLECTOR_VIOLATION",
    ],
  },
  PIPEDA_4_6_1: {
    id: "PIPEDA_4_6_1",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.6.1",
    shortLabel: "Sufficient Accuracy",
    description:
      "Information shall be sufficiently accurate, complete, and up-to-date to minimize the possibility that inappropriate information may be used to make a decision about the individual.",
    violationCategories: [
      "ACCOUNT_STATUS_INCONSISTENCY",
      "BUREAU_DISPUTE_MARKING_FAILURE",
      "CONSUMER_STATEMENT_SUPPRESSION",
    ],
  },
  PIPEDA_4_7: {
    id: "PIPEDA_4_7",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.7",
    shortLabel: "Safeguards",
    description:
      "Personal information shall be protected by security safeguards appropriate to the sensitivity of the information.",
    violationCategories: ["IDENTITY_THEFT_VIOLATION"],
  },
  PIPEDA_4_9: {
    id: "PIPEDA_4_9",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.9",
    shortLabel: "Individual Access",
    description:
      "Upon request, an individual shall be informed of the existence, use, and disclosure of his or her personal information and shall be given access to that information.",
    violationCategories: [
      "RESPONSE_MOV_MISSING",
      "CONSUMER_STATEMENT_SUPPRESSION",
      "DISCLOSURE_DEFICIENCY",
    ],
  },
  PIPEDA_4_10: {
    id: "PIPEDA_4_10",
    statute: "PIPEDA",
    citation: "Schedule 1, Principle 4.10",
    shortLabel: "Challenging Compliance",
    description:
      "An individual shall be able to address a challenge concerning compliance with the above principles.",
    violationCategories: [
      "FURNISHER_POST_DISPUTE_RETALIATION",
      "RESPONSE_MOV_MISSING",
      "RESPONSE_INCOMPLETE",
      "RESPONSE_NO_DOCUMENTATION",
      "RESPONSE_ADDRESS_MISMATCH",
      "RESPONSE_UNAUTHORIZED",
      "INVESTIGATION_RUBBER_STAMP",
      "CREDITOR_RESPONSE_QUALITY",
      "FURNISHER_RESPONSE_QUALITY",
    ],
  },
};

const generalEntries: Record<string, RegulationEntry> = {
  BIA_S178_2: {
    id: "BIA_S178_2",
    statute: "Bankruptcy and Insolvency Act",
    citation: "s.178(2)",
    shortLabel: "BIA Discharge",
    description:
      "An order of discharge releases the bankrupt from all claims provable in bankruptcy.",
    violationCategories: ["BANKRUPTCY_DISCHARGE_VIOLATION"],
  },
  BIA_S168_1: {
    id: "BIA_S168_1",
    statute: "Bankruptcy and Insolvency Act",
    citation: "s.168.1",
    shortLabel: "BIA Automatic Discharge",
    description: "Automatic discharge conditions",
    violationCategories: ["BANKRUPTCY_DISCHARGE_VIOLATION"],
  },
  CHRA: {
    id: "CHRA",
    statute: "Canadian Human Rights Act",
    citation: "R.S.C. 1985, c. H-6",
    shortLabel: "CHRA",
    description: "Protects against discrimination",
    violationCategories: [],
    sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/h-6/",
  },
  INVESTIGATION_30_DAY: {
    id: "INVESTIGATION_30_DAY",
    statute: "Investigation Timeframes",
    citation: "30-day statutory limit",
    shortLabel: "30-Day Investigation",
    description: "30-day statutory investigation period",
    violationCategories: [
      "BUREAU_INVESTIGATION_FAILURE",
      "PROCEDURAL_TIMING_VIOLATION",
    ],
    authorityType: "procedural_rule",
    sourceQuality: "local_registry",
    supportLevel: "procedural_requirement",
  },
  ON_FAIRNESS_CRA_2017: {
    id: "ON_FAIRNESS_CRA_2017",
    statute: "Ontario CRA",
    citation: "R.S.O. 1990, c. C.33, ss. 12.1-12.4",
    shortLabel: "ON Security Freeze",
    description:
      "Ontario consumer reporting rules include identity-theft alert and security-freeze protections for consumer files.",
    violationCategories: [
      "FREEZE_PERIOD_VIOLATION",
      "IDENTITY_THEFT_VIOLATION",
      "BUREAU_ACCESS_VIOLATION",
    ],
  },
  METRO2_BASE_SEGMENT: {
    id: "METRO2_BASE_SEGMENT",
    statute: "Metro2 CRRG",
    citation: "§4.1 Base Segment",
    shortLabel: "Metro2 Base Segment",
    description: "Data furnishers must report complete and accurate information",
    violationCategories: ["DOCUMENTATION_CHAIN_FAILURE"],
    authorityType: "reporting_standard",
    sourceQuality: "private_standard",
    supportLevel: "reporting_standard",
  },
  METRO2_J1_SEGMENT: {
    id: "METRO2_J1_SEGMENT",
    statute: "Metro2 CRRG",
    citation: "§4.2 J1 Segment",
    shortLabel: "Metro2 J1 Segment",
    description: "Joint account reporting requirements",
    violationCategories: ["FURNISHER_JOINT_ACCOUNT_VIOLATION"],
    authorityType: "reporting_standard",
    sourceQuality: "private_standard",
    supportLevel: "reporting_standard",
  },
  METRO2_J2_SEGMENT: {
    id: "METRO2_J2_SEGMENT",
    statute: "Metro2 CRRG",
    citation: "§4.3 J2 Segment",
    shortLabel: "Metro2 J2 Segment",
    description: "Authorized user reporting requirements",
    violationCategories: ["FURNISHER_AUTHORIZED_USER_MISREPRESENTATION"],
    authorityType: "reporting_standard",
    sourceQuality: "private_standard",
    supportLevel: "reporting_standard",
  },
  METRO2_CLASSIFICATION: {
    id: "METRO2_CLASSIFICATION",
    statute: "Metro2 CRRG",
    citation: "§5.1 Classification codes",
    shortLabel: "Metro2 Classification",
    description: "Account type and classification accuracy",
    violationCategories: [],
    authorityType: "reporting_standard",
    sourceQuality: "private_standard",
    supportLevel: "reporting_standard",
  },
  METRO2_PAYMENT_RATING: {
    id: "METRO2_PAYMENT_RATING",
    statute: "Metro2 CRRG",
    citation: "§6.1 Payment rating codes",
    shortLabel: "Metro2 Payment Rating",
    description: "Payment history profile reporting requirements",
    violationCategories: ["PAYMENT_HISTORY_MANIPULATION"],
    authorityType: "reporting_standard",
    sourceQuality: "private_standard",
    supportLevel: "reporting_standard",
  },
};

const PROVINCES: CanadianProvince[] = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

const getProvKeys = (suffix: string) => PROVINCES.map((p) => `${p}_${suffix}`);

const STATUTE_ENTRIES: Record<string, RegulationEntry> = {
  ...pipedaEntries,
  ...generalEntries,
};

function addFieldRequirementEntry(entry: RegulationEntry) {
  if (STATUTE_ENTRIES[entry.id]) {
    throw new Error(`Duplicate regulation registry id: ${entry.id}`);
  }

  STATUTE_ENTRIES[entry.id] = {
    authorityType: "statute",
    sourceQuality: "official",
    supportLevel: "field_requirement",
    effectiveDate: null,
    allowsFieldRequiredLanguage: true,
    ...entry,
  };
}

PROVINCES.forEach((prov) => {
  const map = PROVINCIAL_CRA_MAPPING[prov];
  if (!map) return;
  const officialAuthority = {
    authorityType: "statute" as const,
    sourceQuality: "official" as const,
    supportLevel: "category_principle" as const,
    jurisdiction: prov,
    province: prov,
    effectiveDate: null,
    allowsFieldRequiredLanguage: false,
  };

  STATUTE_ENTRIES[`${prov}_CRA_ACCURACY`] = {
    ...officialAuthority,
    id: `${prov}_CRA_ACCURACY`,
    statute: map.statuteName,
    citation: map.sections.accuracy,
    shortLabel: `${prov} CRA Accuracy`,
    sourceUrl: map.creditReportingSourceUrl,
    description:
      "Credit information must be based on best evidence reasonably available.",
    violationCategories: [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ACCOUNT_STATUS_INCONSISTENCY",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_REPORTING_LIMIT`] = {
    ...officialAuthority,
    id: `${prov}_CRA_REPORTING_LIMIT`,
    statute: map.statuteName,
    citation: map.sections.reportingLimit,
    shortLabel: `${prov} CRA Limits`,
    sourceUrl: map.creditReportingSourceUrl,
    description: "Prohibits reporting of information beyond statutory limits.",
    violationCategories: [
      "STATUTE_OF_LIMITATIONS",
      "STATUTE_APPROACHING",
      "STALE_REPORTING_FAILURE",
      "FURNISHER_REAGING_VIOLATION",
      "LAST_ACTIVITY_DATE_MANIPULATION",
      "TEMPORAL_MANIPULATION",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_REINVESTIGATION`] = {
    ...officialAuthority,
    id: `${prov}_CRA_REINVESTIGATION`,
    statute: map.statuteName,
    citation: map.sections.dispute,
    shortLabel: `${prov} CRA Reinvestigation`,
    sourceUrl: map.creditReportingSourceUrl,
    description:
      "CRA must investigate disputed information within reasonable timeframe.",
    violationCategories: [
      "BUREAU_INVESTIGATION_FAILURE",
      "INVESTIGATION_RUBBER_STAMP",
      "BUREAU_DISPUTE_MARKING_FAILURE",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_REINSERTION`] = {
    ...officialAuthority,
    id: `${prov}_CRA_REINSERTION`,
    statute: map.statuteName,
    citation: map.sections.bureauObligations,
    shortLabel: `${prov} CRA Reinsertion`,
    sourceUrl: map.creditReportingSourceUrl,
    description:
      "CRA obligations around reinserting previously deleted information.",
    violationCategories: [
      "BUREAU_REINSERTION_VIOLATION",
      "ZOMBIE_DEBT_RESURRECTION",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_CONSUMER_STATEMENT`] = {
    ...officialAuthority,
    id: `${prov}_CRA_CONSUMER_STATEMENT`,
    statute: map.statuteName,
    citation: map.sections.dispute,
    shortLabel: `${prov} CRA Consumer Statement`,
    sourceUrl: map.creditReportingSourceUrl,
    description: "Consumer right to add a statement to their file.",
    violationCategories: ["CONSUMER_STATEMENT_SUPPRESSION"],
  };

  STATUTE_ENTRIES[`${prov}_CRA_PERMISSIBLE_PURPOSE`] = {
    ...officialAuthority,
    id: `${prov}_CRA_PERMISSIBLE_PURPOSE`,
    statute: map.statuteName,
    citation: map.sections.permissiblePurpose,
    shortLabel: `${prov} CRA Permissible Purpose`,
    sourceUrl: map.creditReportingSourceUrl,
    description: "Limits access to credit reports to permissible purposes.",
    violationCategories: ["BUREAU_ACCESS_VIOLATION"],
  };

  STATUTE_ENTRIES[`${prov}_CRA_DISCLOSURE`] = {
    ...officialAuthority,
    id: `${prov}_CRA_DISCLOSURE`,
    statute: map.statuteName,
    citation: map.sections.disclosure,
    shortLabel: `${prov} CRA Disclosure`,
    sourceUrl: map.creditReportingSourceUrl,
    description: "Right to access and review information in file.",
    violationCategories: ["DISCLOSURE_DEFICIENCY"],
  };

  STATUTE_ENTRIES[`${prov}_COLLECTION_ACT`] = {
    ...officialAuthority,
    id: `${prov}_COLLECTION_ACT`,
    statute: map.collectionStatuteName,
    citation: map.sections.collection,
    shortLabel: `${prov} Collection Act`,
    sourceUrl: map.collectionSourceUrl,
    description:
      "Collection agencies must identify original creditor, be licensed, and not use unauthorized fees.",
    violationCategories: [
      "COLLECTOR_LICENSE_FAILURE",
      "COLLECTOR_UNAUTHORIZED_FEES",
      "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
      "COLLECTOR_DUPLICATE_REPORTING",
      "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION",
      "PHANTOM_DEBT_UNVERIFIABLE",
      "MULTIPLE_COLLECTOR_VIOLATION",
    ],
  };

  addFieldRequirementEntry({
    id: `${prov}_COLLECTION_ORIGINAL_CREDITOR_FIELD`,
    statute: map.collectionStatuteName,
    citation: map.sections.collection,
    shortLabel: `${prov} Original Creditor Disclosure`,
    sourceUrl: map.collectionSourceUrl,
    description:
      "Collection agency rules support identifying the original creditor for collection-account reporting and collection communications.",
    violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "PHANTOM_DEBT_UNVERIFIABLE"],
    jurisdiction: prov,
    province: prov,
    fieldNames: ["originalCreditorName"],
    accountTypes: ["collection", "collection_account", "debt_collection"],
  });

  STATUTE_ENTRIES[`${prov}_LIMITATIONS_ACT`] = {
    ...officialAuthority,
    id: `${prov}_LIMITATIONS_ACT`,
    statute: map.limitationsStatuteName,
    citation: map.limitationsStatuteName,
    shortLabel: `${prov} Limitations Act`,
    sourceUrl: map.limitationsSourceUrl,
    description: "Statute of limitations for commencing legal action for debt.",
    violationCategories: ["COLLECTOR_STATUTE_REVIVAL_ATTEMPT"],
  };
});

const DOCUMENTATION_FIELD_REQUIREMENT_IDS = [
  ...getProvKeys("COLLECTION_ORIGINAL_CREDITOR_FIELD"),
  "AB_CPRR_SOURCE_RECORD_FIELDS",
  "AB_CPRR_LEGAL_ACTION_STATUS_FIELD",
  "BC_BPCPA_SOURCE_RECORD_FIELDS",
  "BC_BPCPA_LEGAL_PROCEEDING_STATUS_FIELD",
  "MB_PIA_JUDGMENT_FIELDS",
  "MB_PIA_WRIT_STATUS_FIELD",
  "NB_CPA_JUDGMENT_FIELDS",
  "NB_CPA_SOURCE_RECORD_FIELDS",
  "NB_CPA_LEGAL_PROCEEDING_STATUS_FIELD",
  "NL_CRA_WRIT_STATUS_FIELD",
  "NS_CRA_JUDGMENT_FIELDS",
  "NS_CRA_COURT_ACTION_STATUS_FIELD",
  "ON_CRA_JUDGMENT_FIELDS",
  "ON_CRA_LEGAL_ACTION_STATUS_FIELD",
  "PE_CRA_JUDGMENT_FIELDS",
  "PE_CRA_WRIT_STATUS_FIELD",
  "SK_CRA_JUDGMENT_FIELDS",
  "SK_CRA_COURT_ACTION_STATUS_FIELD",
] as const;

const DISCLOSURE_FIELD_REQUIREMENT_IDS = [
  ...DOCUMENTATION_FIELD_REQUIREMENT_IDS,
  "BC_BPCPA_CONSUMER_STATEMENT_FIELD",
  "QC_CAAA_EXPLANATORY_STATEMENT_FIELD",
] as const;

const CONSUMER_STATEMENT_FIELD_REQUIREMENT_IDS = [
  "BC_BPCPA_CONSUMER_STATEMENT_FIELD",
  "QC_CAAA_EXPLANATORY_STATEMENT_FIELD",
] as const;

const STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS = [
  "AB_CPRR_DEBT_REPORTING_LIMIT_ANCHORS",
  "MB_PIA_STATUTE_BARRED_EVIDENCE_FIELD",
  "NB_CPA_DEBT_REPORTING_LIMIT_ANCHORS",
  "NL_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  "NS_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  "ON_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  "PE_CRA_STATUTE_BARRED_EVIDENCE_FIELD",
  "SK_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
] as const;

const mergeRegulationIds = (...groups: Array<readonly string[]>): string[] => [
  ...new Set(groups.flatMap((group) => group)),
];

addFieldRequirementEntry({
  id: "AB_CPRR_SOURCE_RECORD_FIELDS",
  statute: "Alberta Credit and Personal Reports Regulation",
  citation: "Alta. Reg. 193/1999, s. 2.1(c)",
  shortLabel: "AB Source Record Fields",
  description:
    "A reporting agency must not maintain or report information unless the source name and address are recorded or retained in its files, or can be readily ascertained by the individual.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "AB",
  province: "AB",
  sourceUrl: "https://kings-printer.alberta.ca/documents/Regs/1999_193.pdf",
  fieldNames: ["sourceName", "sourceAddress"],
  accountTypes: ["credit_report_source_record", "consumer_report_source_record", "reported_information"],
});

addFieldRequirementEntry({
  id: "AB_CPRR_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "Alberta Credit and Personal Reports Regulation",
  citation: "Alta. Reg. 193/1999, s. 4(b)",
  shortLabel: "AB Debt Limit Anchors",
  description:
    "Unfavourable debt information is time-limited by the later of the last payment date or the date the debt was incurred.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "AB",
  province: "AB",
  sourceUrl: "https://kings-printer.alberta.ca/documents/Regs/1999_193.pdf",
  fieldNames: ["dateOfLastPayment", "dateDebtIncurred"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "AB_CPRR_LEGAL_ACTION_STATUS_FIELD",
  statute: "Alberta Credit and Personal Reports Regulation",
  citation: "Alta. Reg. 193/1999, s. 4(k)",
  shortLabel: "AB Court Action Status",
  description:
    "Court action or court proceeding information older than 12 months may be reported only if the current status has been ascertained and included in the report.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "AB",
  province: "AB",
  sourceUrl: "https://kings-printer.alberta.ca/documents/Regs/1999_193.pdf",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

addFieldRequirementEntry({
  id: "BC_BPCPA_SOURCE_RECORD_FIELDS",
  statute: "BC Business Practices and Consumer Protection Act",
  citation: "S.B.C. 2004, c. 2, s. 109(1)(a)",
  shortLabel: "BC Source Record Fields",
  description:
    "A reporting agency must not include information in a report unless the source name and address are recorded in its files or can be readily ascertained by the individual.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "BC",
  province: "BC",
  sourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_00_multi",
  fieldNames: ["sourceName", "sourceAddress"],
  accountTypes: ["credit_report_source_record", "consumer_report_source_record", "reported_information"],
});

addFieldRequirementEntry({
  id: "BC_BPCPA_LEGAL_PROCEEDING_STATUS_FIELD",
  statute: "BC Business Practices and Consumer Protection Act",
  citation: "S.B.C. 2004, c. 2, s. 109(1)(n)",
  shortLabel: "BC Legal Proceeding Status",
  description:
    "Legal proceeding information older than 12 months may be reported only if the current status has been ascertained and is included in the report.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "BC",
  province: "BC",
  sourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_00_multi",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

addFieldRequirementEntry({
  id: "BC_BPCPA_CONSUMER_STATEMENT_FIELD",
  statute: "BC Business Practices and Consumer Protection Act",
  citation: "S.B.C. 2004, c. 2, s. 111",
  shortLabel: "BC Consumer Explanation",
  description:
    "A reporting agency must retain a consumer's explanation or additional information and include it in reports to which it relates.",
  violationCategories: ["CONSUMER_STATEMENT_SUPPRESSION", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "BC",
  province: "BC",
  sourceUrl: "https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_00_multi",
  fieldNames: ["consumerStatement", "consumerExplanation", "explanation"],
  accountTypes: ["consumer_statement", "dispute_statement", "consumer_explanation"],
});

addFieldRequirementEntry({
  id: "MB_PIA_STATUTE_BARRED_EVIDENCE_FIELD",
  statute: "Manitoba Personal Investigations Act",
  citation: "C.C.S.M. c. P34, s. 4(c)",
  shortLabel: "MB Statute-Barred Evidence",
  description:
    "Records or information about writs, judgments, collections, or debts that are statute-barred may be included only if accompanied by evidence in the file that recovery is not barred by the expiry of a limitation period.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "MB",
  province: "MB",
  sourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/p034.php?lang=en",
  fieldNames: ["notStatuteBarredEvidence", "limitationRecoveryEvidence"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt", "judgment", "writ"],
});

addFieldRequirementEntry({
  id: "MB_PIA_WRIT_STATUS_FIELD",
  statute: "Manitoba Personal Investigations Act",
  citation: "C.C.S.M. c. P34, s. 4(d)",
  shortLabel: "MB Writ Status",
  description:
    "Information about a writ issued more than one year before the report date may be included only if the current status of the action has been ascertained and recorded in the file.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "MB",
  province: "MB",
  sourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/p034.php?lang=en",
  fieldNames: ["currentStatus"],
  accountTypes: ["writ", "legal_proceeding", "court_action", "legal_action"],
});

addFieldRequirementEntry({
  id: "MB_PIA_JUDGMENT_FIELDS",
  statute: "Manitoba Personal Investigations Act",
  citation: "C.C.S.M. c. P34, s. 4(e)",
  shortLabel: "MB Judgment Fields",
  description:
    "Information about a judgment for payment of money may be included only if the judgment creditor name, available address at judgment entry, and amount are mentioned.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "MB",
  province: "MB",
  sourceUrl: "https://web2.gov.mb.ca/laws/statutes/ccsm/p034.php?lang=en",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentAmount"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "NB_CPA_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "New Brunswick Consumer Protection Act",
  citation: "S.N.B. 2024, c. 1, s. 254(3)(a)-(b)",
  shortLabel: "NB Debt Limit Anchors",
  description:
    "Debt information is time-limited by the last payment date, or by the default date if no payment has been made, unless non-statute-barred confirmation appears in the file.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "NB",
  province: "NB",
  sourceUrl: "https://laws.gnb.ca/en/document/cs/2024-C.1",
  fieldNames: ["dateOfLastPayment", "dateOfDefault"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "NB_CPA_JUDGMENT_FIELDS",
  statute: "New Brunswick Consumer Protection Act",
  citation: "S.N.B. 2024, c. 1, s. 254(3)(g)",
  shortLabel: "NB Judgment Fields",
  description:
    "A monetary judgment may be included only if the judgment creditor name, available judgment creditor or agent address, and amount are mentioned.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NB",
  province: "NB",
  sourceUrl: "https://laws.gnb.ca/en/document/cs/2024-C.1",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentCreditorAgentAddress", "judgmentAmount"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "NB_CPA_LEGAL_PROCEEDING_STATUS_FIELD",
  statute: "New Brunswick Consumer Protection Act",
  citation: "S.N.B. 2024, c. 1, s. 254(3)(k)",
  shortLabel: "NB Legal Proceeding Status",
  description:
    "Other legal proceeding information may be included only if the current status has been ascertained and is included in the credit report.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NB",
  province: "NB",
  sourceUrl: "https://laws.gnb.ca/en/document/cs/2024-C.1",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

addFieldRequirementEntry({
  id: "NB_CPA_SOURCE_RECORD_FIELDS",
  statute: "New Brunswick Consumer Protection Act",
  citation: "S.N.B. 2024, c. 1, s. 254(4)",
  shortLabel: "NB Source Record Fields",
  description:
    "Information may be included in a credit report only if the source is included, the source mailing address and telephone number are included or readily ascertainable, and the source details are recorded in the consumer file.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NB",
  province: "NB",
  sourceUrl: "https://laws.gnb.ca/en/document/cs/2024-C.1",
  fieldNames: ["sourceName", "sourceMailingAddress", "sourcePhone"],
  accountTypes: ["credit_report_source_record", "consumer_report_source_record", "reported_information"],
});

addFieldRequirementEntry({
  id: "NL_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "Newfoundland and Labrador Consumer Reporting Agencies Act",
  citation: "R.S.N.L. 1990, c. C-32, s. 22(d)",
  shortLabel: "NL Debt Limit Anchors",
  description:
    "Debt information is time-limited from when the debt became due unless the debt has been acknowledged in writing or by part payment or partial satisfaction.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "NL",
  province: "NL",
  sourceUrl: "https://assembly.nl.ca/legislation/sr/annualstatutes/RSN1990/C32.c90.htm",
  fieldNames: ["dateDebtBecameDue", "dateOfAcknowledgment", "dateOfPartialPayment"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "NL_CRA_WRIT_STATUS_FIELD",
  statute: "Newfoundland and Labrador Consumer Reporting Agencies Act",
  citation: "R.S.N.L. 1990, c. C-32, s. 22(j)",
  shortLabel: "NL Writ Status",
  description:
    "Writ information issued more than one year before the consumer report may be reported only if the agency has ascertained the writ's current status and has a record of its current status in the consumer report.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NL",
  province: "NL",
  sourceUrl: "https://assembly.nl.ca/legislation/sr/annualstatutes/RSN1990/C32.c90.htm",
  fieldNames: ["currentStatus"],
  accountTypes: ["writ", "legal_proceeding", "court_action", "legal_action"],
});

addFieldRequirementEntry({
  id: "NS_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "Nova Scotia Consumer Reporting Act",
  citation: "R.S.N.S. 1989, c. 93, s. 9(3)(c)",
  shortLabel: "NS Debt Limit Anchors",
  description:
    "Debt information is time-limited by the last payment date, or by the default date if no payment was made.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "NS",
  province: "NS",
  sourceUrl: "https://nslegislature.ca/sites/default/files/legc/statutes/consumer%20reporting.pdf",
  fieldNames: ["dateOfLastPayment", "dateOfDefault"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "NS_CRA_JUDGMENT_FIELDS",
  statute: "Nova Scotia Consumer Reporting Act",
  citation: "R.S.N.S. 1989, c. 93, s. 9(3)(d)",
  shortLabel: "NS Judgment Fields",
  description:
    "A judgment may be included only if the judgment creditor name, available address at judgment entry, amount, and available assignee details are mentioned where applicable.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NS",
  province: "NS",
  sourceUrl: "https://nslegislature.ca/sites/default/files/legc/statutes/consumer%20reporting.pdf",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentAmount", "judgmentAssigneeName", "judgmentAssigneeAddress"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "NS_CRA_COURT_ACTION_STATUS_FIELD",
  statute: "Nova Scotia Consumer Reporting Act",
  citation: "R.S.N.S. 1989, c. 93, s. 9(3)(da)",
  shortLabel: "NS Court Action Status",
  description:
    "Court action or proceeding information beyond the statutory age limits may be reported only if the current status has been ascertained and recorded in the file.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "NS",
  province: "NS",
  sourceUrl: "https://nslegislature.ca/sites/default/files/legc/statutes/consumer%20reporting.pdf",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

addFieldRequirementEntry({
  id: "ON_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "Ontario Consumer Reporting Act",
  citation: "R.S.O. 1990, c. C.33, s. 9(3)(f)(i)",
  shortLabel: "ON Debt Limit Anchors",
  description:
    "Debt information is time-limited by the last payment date, or by the debt commencement date if no payment was made.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "ON",
  province: "ON",
  sourceUrl: "https://www.ontario.ca/laws/statute/90c33",
  fieldNames: ["dateOfLastPayment", "dateDebtIncurred", "dateDebtCommenced"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "ON_CRA_JUDGMENT_FIELDS",
  statute: "Ontario Consumer Reporting Act",
  citation: "R.S.O. 1990, c. C.33, s. 9(3)(d)",
  shortLabel: "ON Judgment Fields",
  description:
    "A judgment may be included only if the judgment creditor name, available address at judgment entry, amount, and available assignee details are mentioned where applicable.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "ON",
  province: "ON",
  sourceUrl: "https://www.ontario.ca/laws/statute/90c33",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentAmount", "judgmentAssigneeName", "judgmentAssigneeAddress"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "ON_CRA_LEGAL_ACTION_STATUS_FIELD",
  statute: "Ontario Consumer Reporting Act",
  citation: "R.S.O. 1990, c. C.33, s. 9(3)(i)",
  shortLabel: "ON Legal Action Status",
  description:
    "Legal action or proceeding information beyond the statutory age limits may be reported only if the current status has been ascertained and is recorded in the file.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "ON",
  province: "ON",
  sourceUrl: "https://www.ontario.ca/laws/statute/90c33",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

addFieldRequirementEntry({
  id: "PE_CRA_JUDGMENT_FIELDS",
  statute: "Prince Edward Island Consumer Reporting Act",
  citation: "R.S.P.E.I. 1988, c. C-20, s. 9(d)",
  shortLabel: "PE Judgment Fields",
  description:
    "A judgment may be included only if the judgment creditor name, available address at judgment entry, and amount are mentioned.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "PE",
  province: "PE",
  sourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/C-20-Consumer%20Reporting%20Act.pdf",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentAmount"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "PE_CRA_STATUTE_BARRED_EVIDENCE_FIELD",
  statute: "Prince Edward Island Consumer Reporting Act",
  citation: "R.S.P.E.I. 1988, c. C-20, s. 9(f)",
  shortLabel: "PE Statute-Barred Evidence",
  description:
    "Judgments, collections, or debts that are statute-barred may be reported only if accompanied by evidence in the file that recovery is not barred by the expiry of a limitation period.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "PE",
  province: "PE",
  sourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/C-20-Consumer%20Reporting%20Act.pdf",
  fieldNames: ["notStatuteBarredEvidence", "limitationRecoveryEvidence"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt", "judgment"],
});

addFieldRequirementEntry({
  id: "PE_CRA_WRIT_STATUS_FIELD",
  statute: "Prince Edward Island Consumer Reporting Act",
  citation: "R.S.P.E.I. 1988, c. C-20, s. 9(i)",
  shortLabel: "PE Writ Status",
  description:
    "Writ information beyond the statutory age limits may be reported only if the current status of the action has been ascertained and recorded in the file.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "PE",
  province: "PE",
  sourceUrl: "https://www.princeedwardisland.ca/sites/default/files/legislation/C-20-Consumer%20Reporting%20Act.pdf",
  fieldNames: ["currentStatus"],
  accountTypes: ["writ", "legal_proceeding", "court_action", "legal_action"],
});

addFieldRequirementEntry({
  id: "QC_CAAA_EXPLANATORY_STATEMENT_FIELD",
  statute: "Quebec Credit Assessment Agents Act",
  citation: "CQLR c. A-8.2, ss. 8, 11",
  shortLabel: "QC Explanatory Statement",
  description:
    "An explanatory statement is a protection measure and must be communicated with personal information or information produced on that basis when the statement applies.",
  violationCategories: ["CONSUMER_STATEMENT_SUPPRESSION", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "QC",
  province: "QC",
  sourceUrl: "https://www.legisquebec.gouv.qc.ca/en/showdoc/cs/A-8.2",
  fieldNames: ["consumerStatement", "explanatoryStatement"],
  accountTypes: ["consumer_statement", "dispute_statement", "explanatory_statement"],
});

addFieldRequirementEntry({
  id: "SK_CRA_DEBT_REPORTING_LIMIT_ANCHORS",
  statute: "Saskatchewan Credit Reporting Act",
  citation: "S.S. 2004, c. C-43.2, s. 22(f)",
  shortLabel: "SK Debt Limit Anchors",
  description:
    "Debt information is time-limited by the last payment date, or by the date the debt was incurred if no payment was made.",
  violationCategories: [
    "STATUTE_OF_LIMITATIONS",
    "STATUTE_APPROACHING",
    "STALE_REPORTING_FAILURE",
    "FURNISHER_REAGING_VIOLATION",
    "LAST_ACTIVITY_DATE_MANIPULATION",
    "TEMPORAL_MANIPULATION",
  ],
  jurisdiction: "SK",
  province: "SK",
  sourceUrl: "https://pubsaskdev.blob.core.windows.net/pubsask-prod/archived/14015/C43-2.pdf",
  fieldNames: ["dateOfLastPayment", "dateDebtIncurred"],
  accountTypes: ["debt", "collection", "collection_account", "charged_off_debt"],
});

addFieldRequirementEntry({
  id: "SK_CRA_JUDGMENT_FIELDS",
  statute: "Saskatchewan Credit Reporting Act",
  citation: "S.S. 2004, c. C-43.2, s. 22(j)",
  shortLabel: "SK Judgment Fields",
  description:
    "A judgment may be included only if the judgment creditor or agent name, available address at judgment entry, and judgment amount are mentioned.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "SK",
  province: "SK",
  sourceUrl: "https://pubsaskdev.blob.core.windows.net/pubsask-prod/archived/14015/C43-2.pdf",
  fieldNames: ["judgmentCreditorName", "judgmentCreditorAddress", "judgmentAmount"],
  accountTypes: ["judgment", "monetary_judgment", "court_judgment", "public_record_judgment"],
});

addFieldRequirementEntry({
  id: "SK_CRA_COURT_ACTION_STATUS_FIELD",
  statute: "Saskatchewan Credit Reporting Act",
  citation: "S.S. 2004, c. C-43.2, s. 22(g)",
  shortLabel: "SK Court Action Status",
  description:
    "Court action or other court proceeding information older than 12 months may be reported only if the current status has been ascertained and is included in the report.",
  violationCategories: ["DOCUMENTATION_CHAIN_FAILURE", "DISCLOSURE_DEFICIENCY"],
  jurisdiction: "SK",
  province: "SK",
  sourceUrl: "https://pubsaskdev.blob.core.windows.net/pubsask-prod/archived/14015/C43-2.pdf",
  fieldNames: ["currentStatus"],
  accountTypes: ["legal_proceeding", "court_action", "court_proceeding", "legal_action", "writ"],
});

const VIOLATION_REGULATION_MAP: Record<ViolationCategory, string[]> = {
  ACCOUNT_STATUS_INCONSISTENCY: [
    "PIPEDA_4_6",
    "PIPEDA_4_6_1",
    ...getProvKeys("CRA_ACCURACY"),
  ],
  BALANCE_CALCULATION_VIOLATION: ["PIPEDA_4_6", ...getProvKeys("CRA_ACCURACY")],
  BANKRUPTCY_DISCHARGE_VIOLATION: ["BIA_S178_2", "BIA_S168_1"],
  BUREAU_ACCESS_VIOLATION: [
    "PIPEDA_4_3",
    ...getProvKeys("CRA_PERMISSIBLE_PURPOSE"),
  ],
  BUREAU_DISPUTE_MARKING_FAILURE: [
    "PIPEDA_4_6_1",
    ...getProvKeys("CRA_REINVESTIGATION"),
  ],
  BUREAU_INVESTIGATION_FAILURE: [
    ...getProvKeys("CRA_REINVESTIGATION"),
  ],
  BUREAU_NOTIFICATION_FAILURE: ["PIPEDA_4_9"],
  BUREAU_REINSERTION_VIOLATION: [
    "PIPEDA_4_9",
    ...getProvKeys("CRA_REINSERTION"),
  ],
  CLOSED_ACCOUNT_BALANCE_INFLATION: ["PIPEDA_4_6"],
  COLLECTION_LIMITATION_EXCEEDED: [
    ...getProvKeys("COLLECTION_ACT"),
    ...getProvKeys("LIMITATIONS_ACT"),
  ],
  COLLECTOR_DUPLICATE_REPORTING: [
    "PIPEDA_4_6",
    ...getProvKeys("COLLECTION_ACT"),
  ],
  COLLECTOR_LICENSE_FAILURE: [...getProvKeys("COLLECTION_ACT")],
  COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION: [
    ...getProvKeys("COLLECTION_ACT"),
  ],
  COLLECTOR_STATUTE_REVIVAL_ATTEMPT: [
    ...getProvKeys("COLLECTION_ACT"),
    ...getProvKeys("LIMITATIONS_ACT"),
  ],
  COLLECTOR_UNAUTHORIZED_FEES: ["PIPEDA_4_6", ...getProvKeys("COLLECTION_ACT")],
  CONSENT_WITHDRAWAL_NOT_HONORED: ["PIPEDA_4_3_8", "PIPEDA_4_3"],
  CONSUMER_STATEMENT_SUPPRESSION: [
    "PIPEDA_4_6_1",
    "PIPEDA_4_9",
    ...getProvKeys("CRA_CONSUMER_STATEMENT"),
    ...CONSUMER_STATEMENT_FIELD_REQUIREMENT_IDS,
  ],
  CREDIT_LIMIT_MANIPULATION: ["PIPEDA_4_6"],
  CREDITOR_RESPONSE_QUALITY: ["PIPEDA_4_10"],
  CROSS_BUREAU_INCONSISTENCY: ["PIPEDA_4_6"],
  CROSS_ENTITY_DISCREPANCY: ["PIPEDA_4_6"],
  DATE_LOGIC_IMPOSSIBLE: ["PIPEDA_4_6"],
  DISCLOSURE_DEFICIENCY: mergeRegulationIds(
    ["PIPEDA_4_9", ...getProvKeys("CRA_DISCLOSURE")],
    DISCLOSURE_FIELD_REQUIREMENT_IDS,
  ),
  DOCUMENTATION_CHAIN_FAILURE: mergeRegulationIds(
    [
      "PIPEDA_4_6",
      "METRO2_BASE_SEGMENT",
      ...getProvKeys("CRA_ACCURACY"),
    ],
    DOCUMENTATION_FIELD_REQUIREMENT_IDS,
  ),
  FREEZE_PERIOD_VIOLATION: ["ON_FAIRNESS_CRA_2017", "PIPEDA_4_7"],
  FURNISHER_AUTHORIZED_USER_MISREPRESENTATION: [
    "PIPEDA_4_3",
    "METRO2_J2_SEGMENT",
  ],
  FURNISHER_JOINT_ACCOUNT_VIOLATION: ["PIPEDA_4_3", "METRO2_J1_SEGMENT"],
  FURNISHER_POST_DISPUTE_RETALIATION: ["PIPEDA_4_10"],
  FURNISHER_REAGING_VIOLATION: mergeRegulationIds(
    ["PIPEDA_4_6", ...getProvKeys("CRA_REPORTING_LIMIT")],
    STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ),
  FURNISHER_RESPONSE_QUALITY: ["PIPEDA_4_10"],
  FURNISHER_STATUS_CODE_MISMATCH: ["PIPEDA_4_6"],
  IDENTITY_THEFT_VIOLATION: ["PIPEDA_4_3", "PIPEDA_4_7"],
  INVESTIGATION_RUBBER_STAMP: [
    "PIPEDA_4_10",
    ...getProvKeys("CRA_REINVESTIGATION"),
  ],
  LAST_ACTIVITY_DATE_MANIPULATION: [
    "PIPEDA_4_6",
    ...getProvKeys("CRA_REPORTING_LIMIT"),
    ...STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ],
  MIXED_FILE_PERSONAL_INFO_MISMATCH: ["PIPEDA_4_6", ...getProvKeys("CRA_ACCURACY")],
  MULTIPLE_COLLECTOR_VIOLATION: [
    "PIPEDA_4_6",
    ...getProvKeys("COLLECTION_ACT"),
  ],
  PAYMENT_HISTORY_MANIPULATION: ["PIPEDA_4_6", "METRO2_PAYMENT_RATING"],
  PHANTOM_DEBT_UNVERIFIABLE: ["PIPEDA_4_6", ...getProvKeys("COLLECTION_ACT")],
  PROCEDURAL_TIMING_VIOLATION: [
    ...getProvKeys("CRA_REINVESTIGATION"),
  ],
  RESPONSE_ADDRESS_MISMATCH: ["PIPEDA_4_10"],
  RESPONSE_INCOMPLETE: ["PIPEDA_4_10"],
  RESPONSE_MOV_MISSING: ["PIPEDA_4_9", "PIPEDA_4_10"],
  RESPONSE_NO_DOCUMENTATION: ["PIPEDA_4_10"],
  RESPONSE_UNAUTHORIZED: ["PIPEDA_4_10"],
  RETROACTIVE_HISTORY_MANIPULATION: ["PIPEDA_4_6"],
  STALE_REPORTING_FAILURE: mergeRegulationIds(
    ["PIPEDA_4_6"],
    STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ),
  STATUTE_APPROACHING: mergeRegulationIds(
    ["PIPEDA_4_5", ...getProvKeys("CRA_REPORTING_LIMIT")],
    STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ),
  STATUTE_OF_LIMITATIONS: mergeRegulationIds(
    ["PIPEDA_4_5", ...getProvKeys("CRA_REPORTING_LIMIT")],
    STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ),
  TEMPORAL_MANIPULATION: mergeRegulationIds(
    ["PIPEDA_4_6", ...getProvKeys("CRA_REPORTING_LIMIT")],
    STATUTE_ANCHOR_FIELD_REQUIREMENT_IDS,
  ),
  ZOMBIE_DEBT_RESURRECTION: ["PIPEDA_4_6", ...getProvKeys("CRA_REINSERTION")],
};

const RETENTION_PERIODS: Record<CanadianProvince, number> = {
  ON: 7,
  QC: 7,
  PE: 7,
  BC: 6,
  AB: 6,
  SK: 6,
  MB: 6,
  NB: 6,
  NS: 6,
  NL: 6,
  NT: 6,
  NU: 6,
  YT: 6,
};

const COLLECTION_LIMITATION_PERIODS: Record<CanadianProvince, number> = {
  ON: 2,
  BC: 2,
  AB: 2,
  SK: 2,
  QC: 3,
  MB: 6,
  NS: 6,
  NB: 6,
  PE: 6,
  NL: 6,
  YT: 6,
  NT: 6,
  NU: 6,
};

const BANKRUPTCY_RETENTION_RULES = {
  firstBankruptcy: {
    generalYears: 6,
    exceptions: { ON: 7, PE: 7 },
  },
  secondBankruptcy: {
    years: 14,
  },
  consumerProposal: {
    fromCompletion: 3,
    fromFiling: 6,
  },
  divisionIProposal: {
    fromCompletion: 3,
  },
  undischarged: "indefinite",
};

function getRegulationById(id: string): RegulationEntry | undefined {
  return STATUTE_ENTRIES[id];
}

function getRegulationsForViolationCategory(
  category: ViolationCategory
): RegulationEntry[] {
  const ids = VIOLATION_REGULATION_MAP[category] || [];
  return ids
    .map((id) => getRegulationById(id))
    .filter((r): r is RegulationEntry => r !== undefined);
}

function getProvincialCraEntry(
  province: CanadianProvince,
  section: string
): RegulationEntry | undefined {
  return STATUTE_ENTRIES[`${province}_CRA_${section}`];
}

function getCollectionActEntry(
  province: CanadianProvince
): RegulationEntry | undefined {
  return STATUTE_ENTRIES[`${province}_COLLECTION_ACT`];
}

function getLimitationsActEntry(
  province: CanadianProvince
): RegulationEntry | undefined {
  return STATUTE_ENTRIES[`${province}_LIMITATIONS_ACT`];
}

function getRetentionYears(province: CanadianProvince): number {
  return RETENTION_PERIODS[province] ?? 6;
}

function getCollectionLimitationYears(province: CanadianProvince): number {
  return COLLECTION_LIMITATION_PERIODS[province] ?? 2;
}

export const regulationRegistry = {
  STATUTE_ENTRIES,
  RETENTION_PERIODS,
  COLLECTION_LIMITATION_PERIODS,
  BANKRUPTCY_RETENTION_RULES,
  VIOLATION_REGULATION_MAP,
  getRegulationById,
  getRegulationsForViolationCategory,
  getProvincialCraEntry,
  getCollectionActEntry,
  getLimitationsActEntry,
  getRetentionYears,
  getCollectionLimitationYears,
};
