

import { LetterContent } from "./pdfGenerator";
import { CanadianProvince } from "./schema";

export interface ExhaustionRecord {
  date: string;
  disputeVector: string;
  deficiencies: string;
}

export interface ComplaintParams {
  consumerName: string;
  consumerAddress: string[];
  consumerEmail?: string;
  consumerPhone?: string;
  bureauName: string;
  tradelineId: number;
  exhaustionHistory: ExhaustionRecord[];
  province: CanadianProvince;
}

export interface ProvincialAuthority {
  name: string;
  address: string[];
  phone?: string;
  webUrl?: string;
}

/**
 * Returns the relevant provincial consumer protection authority contact information.
 */
export function getProvincialAuthority(province: string): ProvincialAuthority {
  const authorities: Record<string, ProvincialAuthority> = {
    AB: {
      name: "Service Alberta, Consumer Contact Centre",
      address: ["3rd Floor, Commerce Place", "10155 102 Street", "Edmonton, AB T5J 4G8"],
      webUrl: "alberta.ca",
    },
    BC: {
      name: "Consumer Protection BC",
      address: ["PO Box 9244", "Victoria, BC V8W 9J2"],
      webUrl: "consumerprotectionbc.ca",
    },
    MB: {
      name: "Consumer Protection Office",
      address: ["302-258 Portage Avenue", "Winnipeg, MB R3C 0B6"],
      webUrl: "gov.mb.ca",
    },
    NB: {
      name: "Financial and Consumer Services Commission (FCNB)",
      address: ["200-225 King Street", "Fredericton, NB E3B 1E1"],
      webUrl: "fcnb.ca",
    },
    NL: {
      name: "Digital Government and Service NL",
      address: ["P.O. Box 8700", "St. John's, NL A1B 4J6"],
      webUrl: "gov.nl.ca",
    },
    NS: {
      name: "Service Nova Scotia",
      address: ["PO Box 1529", "Halifax, NS B3J 2Y4"],
      webUrl: "novascotia.ca",
    },
    NT: {
      name: "Consumer Affairs, GNWT",
      address: ["PO Box 1320", "Yellowknife, NT X1A 2L9"],
      webUrl: "maca.gov.nt.ca",
    },
    NU: {
      name: "Consumer Affairs, Government of Nunavut",
      address: ["PO Box 1000, Station 1310", "Iqaluit, NU X0A 0H0"],
      webUrl: "gov.nu.ca",
    },
    ON: {
      name: "Ministry of Public and Business Service Delivery",
      address: ["P.O. Box 450", "Toronto, ON M7A 2J6"],
      webUrl: "ontario.ca",
    },
    PE: {
      name: "Consumer Services, Department of Justice and Public Safety",
      address: ["PO Box 2000", "Charlottetown, PE C1A 7N8"],
      webUrl: "princeedwardisland.ca",
    },
    QC: {
      name: "Commission d'accès à l'information du Québec",
      address: ["Suite 2.36", "525, boulevard René-Lévesque Est", "Québec, QC G1R 5S9"],
      webUrl: "cai.gouv.qc.ca",
    },
    SK: {
      name: "Financial and Consumer Affairs Authority (FCAA)",
      address: ["Suite 601, 1919 Saskatchewan Drive", "Regina, SK S4P 4H2"],
      webUrl: "fcaa.gov.sk.ca",
    },
    YT: {
      name: "Consumer Services, Government of Yukon",
      address: ["Box 2703", "Whitehorse, YT Y1A 2C6"],
      webUrl: "yukon.ca",
    },
  };

  return authorities[province] || authorities["ON"]; // Default fallback
}

/**
 * Returns the relevant provincial statutory citation for credit reporting.
 */
function getStatutoryCitation(province: CanadianProvince): string {
  const citations: Record<string, string> = {
    AB: "Consumer Protection Act, R.S.A. 2000, c. C-26.1",
    BC: "Business Practices and Consumer Protection Act, S.B.C. 2004, c. 2",
    MB: "Personal Investigations Act, C.C.S.M. c. P34",
    NB: "Credit Reporting Services Act, S.N.B. 1973, c. C-32.5",
    NL: "Consumer Protection and Business Practices Act, S.N.L. 2009, c. C-31.1",
    NS: "Consumer Reporting Act, R.S.N.S. 1989, c. 93",
    NT: "Consumer Protection Act, R.S.N.W.T. 1988, c. C-17",
    NU: "Consumer Protection Act, R.S.N.W.T. (Nu) 1988, c. C-17",
    ON: "Consumer Reporting Act, R.S.O. 1990, c. C.33",
    PE: "Consumer Reporting Act, R.S.P.E.I. 1988, c. C-20",
    QC: "Act respecting the collection of personal information relating to credit, CQLR c R-2.2",
    SK: "Credit Reporting Act, S.S. 2004, c. C-43.2",
    YT: "Consumers Protection Act, R.S.Y. 2002, c. 40",
  };

  return citations[province] || "Applicable Provincial Consumer Reporting Legislation";
}

/**
 * Formats the exhaustion history for insertion into the complaint body.
 */
function formatExhaustionHistory(history: ExhaustionRecord[]): string {
  if (!history || history.length === 0) {
    return "No prior dispute history provided.";
  }

  return history
    .map(
      (h, i) =>
        `${i + 1}. Date: ${h.date}\n   Dispute Vector: ${h.disputeVector}\n   Deficiencies Found: ${h.deficiencies}`
    )
    .join("\n\n");
}

/**
 * Generates an FCAC complaint letter.
 */
export function generateFCACComplaint(params: ComplaintParams): LetterContent {
  const historyText = formatExhaustionHistory(params.exhaustionHistory);
  const statute = getStatutoryCitation(params.province);

  const subject = `Formal Complaint Against ${params.bureauName} — Repeated Procedural Non-Compliance`;

  const introduction = `I am submitting a formal complaint against ${params.bureauName} regarding their failure to comply with consumer reporting obligations. Under the FCAC's consumer complaint mechanism, I am escalating this matter as the dispute has reached Phase 4: Procedural Exhaustion, having exhausted all available internal dispute phases.`;

  const disputedItems = `This complaint relates to tradeline reference ${params.tradelineId}. Despite ${params.exhaustionHistory.length} rounds of dispute, the bureau has failed to comply with its obligations. The following procedural history outlines the exhaustion of all available administrative remedies:\n\n${historyText}`;

  const statutoryGrounds = `This systematic procedural failure violates the ${statute}. The bureau has demonstrated a failure to maintain accurate records and conduct reasonable investigations as required by law.`;

  const requestedAction = `I request that the Financial Consumer Agency of Canada investigate these procedural failures and take appropriate enforcement action against ${params.bureauName} for non-compliance.`;

  const certification = "I certify that the information provided in this complaint reflects the procedural history of this matter.";
  const closing = "Sincerely,";

  return {
    consumerName: params.consumerName,
    consumerAddress: params.consumerAddress,
    consumerEmail: params.consumerEmail,
    consumerPhone: params.consumerPhone,
    letterDate: new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(new Date()),
    recipientName: "Financial Consumer Agency of Canada",
    recipientAddress: ["427 Laurier Ave. West, 6th Floor", "Ottawa, ON K1R 1B9"],
    subject,
    introduction,
    disputedItems,
    statutoryGrounds,
    requestedAction,
    certification,
    closing,
  };
}

/**
 * Generates a Provincial Authority complaint letter.
 */
export function generateProvincialComplaint(params: ComplaintParams): LetterContent {
  const authority = getProvincialAuthority(params.province);
  const historyText = formatExhaustionHistory(params.exhaustionHistory);
  const statute = getStatutoryCitation(params.province);

  const subject = `Formal Complaint Against ${params.bureauName} — Repeated Procedural Non-Compliance`;

  const introduction = `I am submitting a formal complaint against ${params.bureauName} regarding their failure to comply with consumer reporting obligations under provincial law. I am escalating this matter to your office as the dispute has reached Phase 4: Procedural Exhaustion, having exhausted all available internal dispute phases.`;

  const disputedItems = `This complaint relates to tradeline reference ${params.tradelineId}. Despite ${params.exhaustionHistory.length} rounds of dispute, the bureau has failed to comply with its obligations. The following procedural history outlines the exhaustion of all available administrative remedies:\n\n${historyText}`;

  const statutoryGrounds = `This systematic procedural failure violates the ${statute}. The bureau has demonstrated a failure to maintain accurate records and conduct reasonable investigations as required by provincial law.`;

  const requestedAction = `I request that ${authority.name} investigate these procedural failures and take appropriate enforcement action against ${params.bureauName} for non-compliance.`;

  const certification = "I certify that the information provided in this complaint reflects the procedural history of this matter.";
  const closing = "Sincerely,";

  return {
    consumerName: params.consumerName,
    consumerAddress: params.consumerAddress,
    consumerEmail: params.consumerEmail,
    consumerPhone: params.consumerPhone,
    letterDate: new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(new Date()),
    recipientName: authority.name,
    recipientAddress: authority.address,
    subject,
    introduction,
    disputedItems,
    statutoryGrounds,
    requestedAction,
    certification,
    closing,
  };
}