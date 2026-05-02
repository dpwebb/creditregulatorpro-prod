/**
 * Knowledge Base PDF Content Sections 13–17
 * Sections: Security, Account & Billing, Glossary, Provincial Reference Guide, FAQ
 */

type Content = any;

import {
  createWarningBox,
  createTable,
  sectionHeader,
  subHeader,
  body,
  bulletList,
  numberedList,
} from "./kbPdfContentUtils";

export const section13 = (): Content[] => [
  sectionHeader(13, "Security"),
  subHeader("SHA-256 Hash Chain & Auditing"),
  body("Uses SHA-256 hash chaining for legal admissibility, originating from a verified genesis block. Comprehensive audit logging records all actions immutably. Logged actions include authentication, CRUD operations, evidence attachment, packet generation, and system operations. Log entries contain Action Type, Timestamp, User ID, IP, Entity, Status, Change Records, and Region."),

  subHeader("Rate Limiting"),
  createTable(
    ["Operation", "Limit"],
    [
      ["Evidence Uploads", "10 per hour"],
      ["Packet Generation", "5 per hour"],
      ["Compliance Rescans", "20 per day"],
      ["API Requests (General)", "1000 per hour"]
    ]
  ),

  subHeader("Session Management & RBAC"),
  body("JWT-based stateless session management ensures security. Tokens expire in 24hr and use HTTP-only cookies. Roles:"),
  bulletList([
    "USER: Can access own tradelines/packets, evidence, packet generation, compliance tools, and profile.",
    "ADMIN: Possesses all USER permissions plus user management, system analytics, security logs, bureau management, regulatory updates, and escalation triggers."
  ]),

  subHeader("Data Sovereignty & Account Security"),
  body("Strict Canada-only data sovereignty. Servers locked to ca-central-1. US bureau files are automatically rejected. Profile identity requires strict validation to prevent account hijacking.")
];

export const section14 = (): Content[] => [
  sectionHeader(14, "Account & Billing"),
  subHeader("Roles & Subscriptions"),
  body("Three active roles: 'user', 'admin', and 'support'. The 'enterprise' role has been officially removed. Billing operates via Stripe."),
  createTable(
    ["Plan", "Pricing", "Features"],
    [
      ["Trial User", "Free for 7 days", "Full access during the trial. Can upgrade anytime."],
      ["Monthly", "$19.95 CAD", "Standard monthly billing."],
      ["Annual", "$49.95 CAD", "Discounted yearly billing."]
    ]
  ),
  body("New registrations receive a 7-day Trial User period. If billing fails or the trial expires without subscription, the account is locked until payment is resolved."),

  subHeader("Profile Requirements & Auth"),
  body("A full legal name and Canadian address are strictly required. Missing profile data blocks packet generation. Authentication supports email verification, password hashing, and OAuth (Google).")
];

export const section15 = (): Content[] => [
  sectionHeader(15, "Glossary"),
  subHeader("A-Z Terminology"),
  bulletList([
    "Auto-Escalation: Automatic progression to next vector.",
    "Bureau/CRA: Credit reporting agency.",
    "Confidence Score: System certainty metric 0-100.",
    "Dispute Vector: Specific challenge strategy.",
    "DOFD: Date of First Delinquency.",
    "DOFD Manipulation/Re-aging: Illegal date changes.",
    "Drift Detection: Change monitoring between reports.",
    "ECOA: Equal Credit Opportunity Act designation.",
    "Furnisher/Creditor: Entity reporting data.",
    "Hash Chain: Cryptographic linking mechanism.",
    "Metro2: Credit reporting standard format.",
    "Obligation Instance: Tracked challenge record.",
    "Packet: Generated dispute letter document.",
    "Permissible Purpose: Legal basis for credit access.",
    "Phase 4: Procedural Exhaustion — Final phase of the 4-phase dispute cycle.",
    "PIPA: Personal Information Protection Act - BC/AB.",
    "PIPEDA: Personal Information Protection and Electronic Documents Act.",
    "Procedural Exhaustion: Completion of all 4 dispute phases (reaching Phase 4).",
    "Terminal Label: Final dispute phase designation.",
    "Tradeline: Individual credit account entry."
  ])
];

export const section16 = (): Content[] => [
  sectionHeader(16, "Provincial Reference Guide"),
  subHeader("Complete Jurisdictional Breakdown"),
  createTable(
    [
      "Province / Territory",
      "Consumer Reporting Legislation",
      "Limitation Period",
      "Investigation Timeframe",
      "Enforcement Body",
      "Special Notes"
    ],
    [
      ["Ontario", "CRA R.S.O. 1990 c. C.33", "2yr", "30 biz days", "Financial Services Regulatory Authority", "-"],
      ["British Columbia", "CRA R.S.B.C. 1996 c. 69", "2yr", "30 biz days", "Office of Information and Privacy Commissioner", "-"],
      ["Alberta", "PIPA S.A. 2003 c. P-6.5", "2yr", "30 days", "Office of Information and Privacy Commissioner", "-"],
      ["Saskatchewan", "CPBPA S.S. 2014 c. C-30.2", "2yr", "30 days", "Financial and Consumer Affairs Authority", "-"],
      ["Quebec", "Credit Agents Act RLRQ c. A-8.2", "3yr", "30 days strict", "Office de la protection du consommateur", "Strict language requirements"],
      ["Manitoba", "CPA C.C.S.M. c. C200", "6yr", "30 days", "Consumer Protection Office", "-"],
      ["Nova Scotia", "CRA S.N.S. 2010 c. 13", "6yr", "30 days", "Service Nova Scotia", "-"],
      ["New Brunswick", "CRA S.N.B. 2009 c. C-24.3", "6yr", "30 days", "Financial and Consumer Services Commission", "-"],
      ["Prince Edward Island", "CRA R.S.P.E.I. 1988 c. C-26", "6yr", "30 days", "Consumer Services", "-"],
      ["Newfoundland", "CPBPA S.N.L. 2009 c. C-31.1", "6yr", "30 days", "Digital Government and Service NL", "-"],
      ["Yukon", "CPA R.S.Y. 2002 c. 40", "6yr", "30 days", "Consumer Services", "-"],
      ["Northwest Territories", "CPA S.N.W.T. 2007 c. 11", "6yr", "30 days", "Consumer Affairs", "-"],
      ["Nunavut", "CPA R.S.N.W.T. (Nu) 1988 c. C-17", "6yr", "30 days", "Consumer Affairs", "-"]
    ],
    ["15%", "25%", "10%", "15%", "25%", "10%"]
  )
];

export const section17 = (): Content[] => [
  sectionHeader(17, "FAQ / Troubleshooting"),
  subHeader("Common Questions"),
  numberedList([
    "What happens if the bureau doesn't respond? -> Auto-escalation to the next vector initiates automatically after the deadline.",
    "Can I skip phases? -> No, the system strictly requires sequential progression to build a court-ready case.",
    "What if my profile doesn't match my ID? -> Packets are blocked until the profile is corrected to match legal identity documents.",
    "How do I know if a dispute was successful? -> Check the obligation instance status and the analytics dashboard.",
    "What is Procedural Exhaustion? -> All 4 phases have been completed (Phase 4 reached), making the tradeline ready for legal action or regulatory complaints.",
    "How long do bureaus have to investigate? -> Generally 30 days, though it varies slightly by province (e.g., 30 business days in ON/BC).",
    "Can I dispute with both bureaus at once? -> Yes, but you must create separate tradelines per bureau in the system.",
    "What if I receive a generic response? -> The system auto-detects deficiency patterns and recommends immediate escalation.",
    "How do I export evidence for court? -> Use the evidence packaging feature to download a complete, hash-verified, court-ready PDF.",
    "What happens after 1 year? -> All data is irrevocably purged per the strict retention policy — export your files before expiration."
  ])
];
