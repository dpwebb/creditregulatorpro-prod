import { ViolationCategory, CanadianProvince } from "./schema";
import styles from "./regulationRegistry.module.css";

export interface RegulationEntry {
  id: string;
  statute: string;
  citation: string;
  shortLabel: string;
  description: string;
  violationCategories: ViolationCategory[];
}

const PROVINCIAL_CRA_MAPPING: Record<CanadianProvince, any> = {
  ON: {
    statuteName: "Ontario CRA",
    sections: {
      accuracy: "R.S.O. 1990, c. C.33, s. 9(3)(a)",
      corroboration: "R.S.O. 1990, c. C.33, s. 9(3)(b)",
      reportingLimit: "R.S.O. 1990, c. C.33, s. 9(3)(f)(i)",
      bankruptcy: "R.S.O. 1990, c. C.33, s. 9(3)(e)",
      identityTheft: "R.S.O. 1990, c. C.33, s. 12.1(1)",
      dispute: "R.S.O. 1990, c. C.33, s. 13",
      collection: "Ontario Collection Agencies Act",
      disclosure: "R.S.O. 1990, c. C.33, s. 12",
      bureauObligations: "R.S.O. 1990, c. C.33, s. 9",
    },
  },
  BC: {
    statuteName: "BC BPCPA",
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
    },
  },
  AB: {
    statuteName: "Alberta Fair Trading Act",
    sections: {
      accuracy: "Part 6.1 (Accuracy)",
      corroboration: "Part 6.1 (Corroboration)",
      reportingLimit: "R.S.A. 2000, c. F-2, Part 6.1",
      bankruptcy: "Part 6.1 (Bankruptcy)",
      identityTheft: "Part 6.1 (Identity Theft)",
      dispute: "Part 6.1 (Dispute)",
      collection: "Part 9 (Collection Agencies)",
      disclosure: "Part 6.1 (Disclosure)",
      bureauObligations: "Part 6.1 (Bureau Obligations)",
    },
  },
  QC: {
    statuteName: "Quebec Consumer Protection Act",
    sections: {
      accuracy: "C.Q.L.R., c. P-40.1 (Accuracy)",
      corroboration: "C.Q.L.R., c. P-40.1 (Corroboration)",
      reportingLimit: "C.Q.L.R., c. P-40.1",
      bankruptcy: "C.Q.L.R., c. P-40.1 (Bankruptcy)",
      identityTheft: "C.Q.L.R., c. P-40.1 (Identity Theft)",
      dispute: "C.Q.L.R., c. P-40.1 (Dispute)",
      collection: "Collection of Certain Debts Act",
      disclosure: "C.Q.L.R., c. P-40.1 (Disclosure)",
      bureauObligations: "C.Q.L.R., c. P-40.1 (Bureau Obligations)",
    },
  },
  SK: {
    statuteName: "Saskatchewan CRA",
    sections: {
      accuracy: "S.S. 2004, c. C-43.2 (Accuracy)",
      corroboration: "S.S. 2004, c. C-43.2 (Corroboration)",
      reportingLimit: "S.S. 2004, c. C-43.2, s. 22",
      bankruptcy: "S.S. 2004, c. C-43.2 (Bankruptcy)",
      identityTheft: "S.S. 2004, c. C-43.2 (Identity Theft)",
      dispute: "S.S. 2004, c. C-43.2 (Dispute)",
      collection: "Saskatchewan Collection Agents Act",
      disclosure: "S.S. 2004, c. C-43.2 (Disclosure)",
      bureauObligations: "S.S. 2004, c. C-43.2 (Bureau Obligations)",
    },
  },
  MB: {
    statuteName: "Manitoba CPA",
    sections: {
      accuracy: "C.C.S.M. c. C200 (Accuracy)",
      corroboration: "C.C.S.M. c. C200 (Corroboration)",
      reportingLimit: "C.C.S.M. c. C200, s. 103(1)",
      bankruptcy: "C.C.S.M. c. C200 (Bankruptcy)",
      identityTheft: "C.C.S.M. c. C200 (Identity Theft)",
      dispute: "C.C.S.M. c. C200 (Dispute)",
      collection: "C.C.S.M. c. C200 Part XII",
      disclosure: "C.C.S.M. c. C200 (Disclosure)",
      bureauObligations: "C.C.S.M. c. C200 (Bureau Obligations)",
    },
  },
  NB: {
    statuteName: "NB Consumer Reporting Agencies Act",
    sections: {
      accuracy: "S.N.B. 2011, c. 146 (Accuracy)",
      corroboration: "S.N.B. 2011, c. 146 (Corroboration)",
      reportingLimit: "S.N.B. 2011, c. 146, s. 14",
      bankruptcy: "S.N.B. 2011, c. 146 (Bankruptcy)",
      identityTheft: "S.N.B. 2011, c. 146 (Identity Theft)",
      dispute: "S.N.B. 2011, c. 146 (Dispute)",
      collection: "Collection Agencies Act",
      disclosure: "S.N.B. 2011, c. 146 (Disclosure)",
      bureauObligations: "S.N.B. 2011, c. 146 (Bureau Obligations)",
    },
  },
  NS: {
    statuteName: "NS Consumer Reporting Act",
    sections: {
      accuracy: "R.S.N.S. 1989, c. 93, s. 9(3)(a)",
      corroboration: "R.S.N.S. 1989, c. 93, s. 9(3)(b)",
      reportingLimit: "R.S.N.S. 1989, c. 93, s. 9(3)(f)",
      bankruptcy: "R.S.N.S. 1989, c. 93, s. 9(3)(e)",
      identityTheft: "R.S.N.S. 1989, c. 93 (Identity Theft)",
      dispute: "R.S.N.S. 1989, c. 93, s. 13",
      collection: "Collection Agencies Act",
      disclosure: "R.S.N.S. 1989, c. 93, s. 11",
      bureauObligations: "R.S.N.S. 1989, c. 93, s. 9",
    },
  },
  PE: {
    statuteName: "PEI Consumer Reporting Act",
    sections: {
      accuracy: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(a)",
      corroboration: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(b)",
      reportingLimit: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(f)",
      bankruptcy: "R.S.P.E.I. 1988, c. C-20, s. 10(3)(e)",
      identityTheft: "R.S.P.E.I. 1988, c. C-20 (Identity Theft)",
      dispute: "R.S.P.E.I. 1988, c. C-20, s. 14",
      collection: "Collection Agencies Act",
      disclosure: "R.S.P.E.I. 1988, c. C-20, s. 12",
      bureauObligations: "R.S.P.E.I. 1988, c. C-20, s. 10",
    },
  },
  NL: {
    statuteName: "NL Consumer Reporting Agencies Act",
    sections: {
      accuracy: "R.S.N.L. 1990, c. C-32, s. 10(3)(a)",
      corroboration: "R.S.N.L. 1990, c. C-32, s. 10(3)(b)",
      reportingLimit: "R.S.N.L. 1990, c. C-32, s. 10(3)(f)",
      bankruptcy: "R.S.N.L. 1990, c. C-32, s. 10(3)(e)",
      identityTheft: "R.S.N.L. 1990, c. C-32 (Identity Theft)",
      dispute: "R.S.N.L. 1990, c. C-32, s. 14",
      collection: "Collections Act",
      disclosure: "R.S.N.L. 1990, c. C-32, s. 12",
      bureauObligations: "R.S.N.L. 1990, c. C-32, s. 10",
    },
  },
  NT: {
    statuteName: "NT Consumer Protection Act",
    sections: {
      accuracy: "R.S.N.W.T. 1988, c. C-17 (Accuracy)",
      corroboration: "R.S.N.W.T. 1988, c. C-17 (Corroboration)",
      reportingLimit: "R.S.N.W.T. 1988, c. C-17",
      bankruptcy: "R.S.N.W.T. 1988, c. C-17 (Bankruptcy)",
      identityTheft: "R.S.N.W.T. 1988, c. C-17 (Identity Theft)",
      dispute: "R.S.N.W.T. 1988, c. C-17 (Dispute)",
      collection: "R.S.N.W.T. 1988, c. C-17 (Collection)",
      disclosure: "R.S.N.W.T. 1988, c. C-17 (Disclosure)",
      bureauObligations: "R.S.N.W.T. 1988, c. C-17 (Bureau Obligations)",
    },
  },
  NU: {
    statuteName: "NU Consumer Protection Act",
    sections: {
      accuracy: "R.S.N.W.T. (Nu) 1988, c. C-17 (Accuracy)",
      corroboration: "R.S.N.W.T. (Nu) 1988, c. C-17 (Corroboration)",
      reportingLimit: "R.S.N.W.T. (Nu) 1988, c. C-17",
      bankruptcy: "R.S.N.W.T. (Nu) 1988, c. C-17 (Bankruptcy)",
      identityTheft: "R.S.N.W.T. (Nu) 1988, c. C-17 (Identity Theft)",
      dispute: "R.S.N.W.T. (Nu) 1988, c. C-17 (Dispute)",
      collection: "R.S.N.W.T. (Nu) 1988, c. C-17 (Collection)",
      disclosure: "R.S.N.W.T. (Nu) 1988, c. C-17 (Disclosure)",
      bureauObligations: "R.S.N.W.T. (Nu) 1988, c. C-17 (Bureau Obligations)",
    },
  },
  YT: {
    statuteName: "YT Consumers Protection Act",
    sections: {
      accuracy: "R.S.Y. 2002, c. 40 (Accuracy)",
      corroboration: "R.S.Y. 2002, c. 40 (Corroboration)",
      reportingLimit: "R.S.Y. 2002, c. 40",
      bankruptcy: "R.S.Y. 2002, c. 40 (Bankruptcy)",
      identityTheft: "R.S.Y. 2002, c. 40 (Identity Theft)",
      dispute: "R.S.Y. 2002, c. 40 (Dispute)",
      collection: "R.S.Y. 2002, c. 40 (Collection)",
      disclosure: "R.S.Y. 2002, c. 40 (Disclosure)",
      bureauObligations: "R.S.Y. 2002, c. 40 (Bureau Obligations)",
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
  },
  METRO2_J1_SEGMENT: {
    id: "METRO2_J1_SEGMENT",
    statute: "Metro2 CRRG",
    citation: "§4.2 J1 Segment",
    shortLabel: "Metro2 J1 Segment",
    description: "Joint account reporting requirements",
    violationCategories: ["FURNISHER_JOINT_ACCOUNT_VIOLATION"],
  },
  METRO2_J2_SEGMENT: {
    id: "METRO2_J2_SEGMENT",
    statute: "Metro2 CRRG",
    citation: "§4.3 J2 Segment",
    shortLabel: "Metro2 J2 Segment",
    description: "Authorized user reporting requirements",
    violationCategories: ["FURNISHER_AUTHORIZED_USER_MISREPRESENTATION"],
  },
  METRO2_CLASSIFICATION: {
    id: "METRO2_CLASSIFICATION",
    statute: "Metro2 CRRG",
    citation: "§5.1 Classification codes",
    shortLabel: "Metro2 Classification",
    description: "Account type and classification accuracy",
    violationCategories: [],
  },
  METRO2_PAYMENT_RATING: {
    id: "METRO2_PAYMENT_RATING",
    statute: "Metro2 CRRG",
    citation: "§6.1 Payment rating codes",
    shortLabel: "Metro2 Payment Rating",
    description: "Payment history profile reporting requirements",
    violationCategories: ["PAYMENT_HISTORY_MANIPULATION"],
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

PROVINCES.forEach((prov) => {
  const map = PROVINCIAL_CRA_MAPPING[prov];
  if (!map) return;

  STATUTE_ENTRIES[`${prov}_CRA_ACCURACY`] = {
    id: `${prov}_CRA_ACCURACY`,
    statute: map.statuteName,
    citation: map.sections.accuracy,
    shortLabel: `${prov} CRA Accuracy`,
    description:
      "Credit information must be based on best evidence reasonably available.",
    violationCategories: [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ACCOUNT_STATUS_INCONSISTENCY",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_REPORTING_LIMIT`] = {
    id: `${prov}_CRA_REPORTING_LIMIT`,
    statute: map.statuteName,
    citation: map.sections.reportingLimit,
    shortLabel: `${prov} CRA Limits`,
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
    id: `${prov}_CRA_REINVESTIGATION`,
    statute: map.statuteName,
    citation: map.sections.dispute,
    shortLabel: `${prov} CRA Reinvestigation`,
    description:
      "CRA must investigate disputed information within reasonable timeframe.",
    violationCategories: [
      "BUREAU_INVESTIGATION_FAILURE",
      "INVESTIGATION_RUBBER_STAMP",
      "BUREAU_DISPUTE_MARKING_FAILURE",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_REINSERTION`] = {
    id: `${prov}_CRA_REINSERTION`,
    statute: map.statuteName,
    citation: map.sections.bureauObligations,
    shortLabel: `${prov} CRA Reinsertion`,
    description:
      "CRA obligations around reinserting previously deleted information.",
    violationCategories: [
      "BUREAU_REINSERTION_VIOLATION",
      "ZOMBIE_DEBT_RESURRECTION",
    ],
  };

  STATUTE_ENTRIES[`${prov}_CRA_CONSUMER_STATEMENT`] = {
    id: `${prov}_CRA_CONSUMER_STATEMENT`,
    statute: map.statuteName,
    citation: map.sections.dispute,
    shortLabel: `${prov} CRA Consumer Statement`,
    description: "Consumer right to add a statement to their file.",
    violationCategories: ["CONSUMER_STATEMENT_SUPPRESSION"],
  };

  STATUTE_ENTRIES[`${prov}_CRA_PERMISSIBLE_PURPOSE`] = {
    id: `${prov}_CRA_PERMISSIBLE_PURPOSE`,
    statute: map.statuteName,
    citation: `${map.statuteName} (Permissible Purpose)`,
    shortLabel: `${prov} CRA Permissible Purpose`,
    description: "Limits access to credit reports to permissible purposes.",
    violationCategories: ["BUREAU_ACCESS_VIOLATION"],
  };

  STATUTE_ENTRIES[`${prov}_CRA_DISCLOSURE`] = {
    id: `${prov}_CRA_DISCLOSURE`,
    statute: map.statuteName,
    citation: map.sections.disclosure,
    shortLabel: `${prov} CRA Disclosure`,
    description: "Right to access and review information in file.",
    violationCategories: ["DISCLOSURE_DEFICIENCY"],
  };

  STATUTE_ENTRIES[`${prov}_COLLECTION_ACT`] = {
    id: `${prov}_COLLECTION_ACT`,
    statute: "Provincial Collection Agency Act",
    citation: map.sections.collection,
    shortLabel: `${prov} Collection Act`,
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

  STATUTE_ENTRIES[`${prov}_LIMITATIONS_ACT`] = {
    id: `${prov}_LIMITATIONS_ACT`,
    statute: "Provincial Limitations Act",
    citation: "Limitations Act",
    shortLabel: `${prov} Limitations Act`,
    description: "Statute of limitations for commencing legal action for debt.",
    violationCategories: ["COLLECTOR_STATUTE_REVIVAL_ATTEMPT"],
  };
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
    "INVESTIGATION_30_DAY",
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
  ],
  CREDIT_LIMIT_MANIPULATION: ["PIPEDA_4_6"],
  CREDITOR_RESPONSE_QUALITY: ["PIPEDA_4_10"],
  CROSS_BUREAU_INCONSISTENCY: ["PIPEDA_4_6"],
  CROSS_ENTITY_DISCREPANCY: ["PIPEDA_4_6"],
  DATE_LOGIC_IMPOSSIBLE: ["PIPEDA_4_6"],
  DISCLOSURE_DEFICIENCY: ["PIPEDA_4_9", ...getProvKeys("CRA_DISCLOSURE")],
  DOCUMENTATION_CHAIN_FAILURE: [
    "PIPEDA_4_6",
    "METRO2_BASE_SEGMENT",
    ...getProvKeys("CRA_ACCURACY"),
  ],
  FREEZE_PERIOD_VIOLATION: ["ON_FAIRNESS_CRA_2017", "PIPEDA_4_7"],
  FURNISHER_AUTHORIZED_USER_MISREPRESENTATION: [
    "PIPEDA_4_3",
    "METRO2_J2_SEGMENT",
  ],
  FURNISHER_JOINT_ACCOUNT_VIOLATION: ["PIPEDA_4_3", "METRO2_J1_SEGMENT"],
  FURNISHER_POST_DISPUTE_RETALIATION: ["PIPEDA_4_10"],
  FURNISHER_REAGING_VIOLATION: [
    "PIPEDA_4_6",
    ...getProvKeys("CRA_REPORTING_LIMIT"),
  ],
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
  ],
  MIXED_FILE_PERSONAL_INFO_MISMATCH: ["PIPEDA_4_6", ...getProvKeys("CRA_ACCURACY")],
  MULTIPLE_COLLECTOR_VIOLATION: [
    "PIPEDA_4_6",
    ...getProvKeys("COLLECTION_ACT"),
  ],
  PAYMENT_HISTORY_MANIPULATION: ["PIPEDA_4_6", "METRO2_PAYMENT_RATING"],
  PHANTOM_DEBT_UNVERIFIABLE: ["PIPEDA_4_6", ...getProvKeys("COLLECTION_ACT")],
  PROCEDURAL_TIMING_VIOLATION: ["INVESTIGATION_30_DAY"],
  RESPONSE_ADDRESS_MISMATCH: ["PIPEDA_4_10"],
  RESPONSE_INCOMPLETE: ["PIPEDA_4_10"],
  RESPONSE_MOV_MISSING: ["PIPEDA_4_9", "PIPEDA_4_10"],
  RESPONSE_NO_DOCUMENTATION: ["PIPEDA_4_10"],
  RESPONSE_UNAUTHORIZED: ["PIPEDA_4_10"],
  RETROACTIVE_HISTORY_MANIPULATION: ["PIPEDA_4_6"],
  STALE_REPORTING_FAILURE: ["PIPEDA_4_6"],
  STATUTE_APPROACHING: ["PIPEDA_4_5", ...getProvKeys("CRA_REPORTING_LIMIT")],
  STATUTE_OF_LIMITATIONS: ["PIPEDA_4_5", ...getProvKeys("CRA_REPORTING_LIMIT")],
  TEMPORAL_MANIPULATION: ["PIPEDA_4_6", ...getProvKeys("CRA_REPORTING_LIMIT")],
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
