import { LLMResponse } from "./docstrangeLLM";
import { extractMappedRecords } from "./_htmlParserUtils";
import { extractAccounts } from "./transunionAccountParser";
import { parseHtmlToRawText } from "./_htmlParserUtils";

/**
 * Central deterministic parser bridging DocStrange raw HTML strings to our strictly typed LLMResponse.
 */
export function parseHtmlToLLMResponse(html: string): LLMResponse {
  const response: LLMResponse = {
    bureau: "TransUnion", // Known static per guidelines
    reportDate: null,
    tuCaseId: null,
    firstReportedDate: null,
    lastReviewedBy: null,
    lastReviewedDate: null,
    consumerInfo: {
      fullName: null,
      dateOfBirth: null,
      currentAddress: null,
      previousAddresses: [],
      employers: [],
    },
    personalInfo: null,
    scores: [],
    tradelines: [],
    inquiries: [],
    creditRelatedInquiries: [],
    nonCreditRelatedInquiries: [],
    accountReviewInquiries: [],
    publicRecords: [],
    insolvency: [],
    crossReferences: [],
    addresses: [],
    employments: [],
    telephoneNumbers: [],
  };

  if (!html) return response;

  // 1. Report Date Extraction
  const dateMatch = html.match(/as of\s+([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/i);
  if (dateMatch) {
    response.reportDate = dateMatch[1];
  } else {
    // Try page 4+ format: <p>Saturday 10 January 2026 19:34</p>
    const headerDateMatch = html.match(/<p>[A-Za-z]+\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+\d{2}:\d{2}<\/p>/i);
    if (headerDateMatch) {
      const [_, day, month, year] = headerDateMatch;
      response.reportDate = `${month.substring(0, 3)} ${day.padStart(2, '0')}, ${year}`;
    }
  }

  const tuCaseMatch = html.match(/TU Case ID\s*[:\s]?\s*([A-Z0-9]+)/i);
  if (tuCaseMatch) {
    response.tuCaseId = tuCaseMatch[1];
  }

  // Extract first reported date, last reviewed by, and last reviewed date
  // from paragraph like: "first reported to TransUnion on <strong>Sep 06, 1989</strong> and was last reviewed by [*CONSUMER DISCLOSURE *] on <strong>Jan 10, 2026</strong>"
  const firstReportedMatch = html.match(/first reported to TransUnion on\s*<strong[^>]*>([^<]+)<\/strong>/i);
  if (firstReportedMatch) {
    response.firstReportedDate = firstReportedMatch[1].trim();
  }

  const lastReviewedByMatch = html.match(/last reviewed by\s*\[\*([^\*]+)\*\]/i);
  if (lastReviewedByMatch) {
    response.lastReviewedBy = lastReviewedByMatch[1].trim();
  }

  const lastReviewedDateMatch = html.match(/last reviewed by[^\n]*on\s*<strong[^>]*>([^<]+)<\/strong>/i);
  if (lastReviewedDateMatch) {
    response.lastReviewedDate = lastReviewedDateMatch[1].trim();
  }

  const personalInfoRows = extractMappedRecords<any>(
    html,
    /Personal Information\s*:?|Personal Info\s*:?/i,
    {
      Surname: "surname",
      "Given Name": "givenNames",
      "Middle Name": "middleName",
      Suffix: "suffix",
      "Social Insurance": "socialInsuranceNo",
      "Birth Date": "birthDate",
    }
  );

  if (personalInfoRows.length > 0) {
    response.personalInfo = personalInfoRows[0];
    const p = response.personalInfo;
    response.consumerInfo!.fullName = [
      p?.givenNames,
      p?.middleName,
      p?.surname,
      p?.suffix,
    ]
      .filter(Boolean)
      .join(" ");
    response.consumerInfo!.dateOfBirth = p?.birthDate || null;
  }

  response.crossReferences = extractMappedRecords(html, /Cross Reference\(s\)\s*:?/i, {
    Type: "type",
    Surname: "surname",
    "Given Name": "givenNames",
    "Middle Name": "middleName",
    Suffix: "suffix",
  });

  response.addresses = extractMappedRecords(html, /Address\(es\)\s*:?/i, {
    Address: "address",
    City: "city",
    Prov: "province",
    Postal: "postalCode",
    Type: "type",
    Own: "ownOrRent",
    Rent: "ownOrRent",
    Since: "sinceDate",
    "Telephone Associations": "telephoneAssociations",
    "Telephone Assoc": "telephoneAssociations",
  });

  if (response.addresses && response.addresses.length > 0) {
    const formatAddress = (a: any) =>
      [a.address, a.city, a.province, a.postalCode]
        .filter(Boolean)
        .join(", ");
    response.consumerInfo!.currentAddress = formatAddress(
      response.addresses[0]
    );
    if (response.addresses.length > 1) {
      response.consumerInfo!.previousAddresses = response.addresses
        .slice(1)
        .map(formatAddress);
    }
  }

  response.employments = extractMappedRecords(html, /Employment\(s\)\s*:?/i, {
    Date: "date",
    Reported: "date",
    Employer: "employerNameCityProvince",
    Occupation: "occupation",
    "Start Date": "startDate",
    "Finish Date": "finishDate",
    Pay: "pay",
    Frequency: "payFrequency",
  });

  if (response.employments && response.employments.length > 0) {
    response.consumerInfo!.employers = response.employments
      .map((e) => e.employerNameCityProvince)
      .filter(Boolean) as string[];
  }

  response.telephoneNumbers = extractMappedRecords(html, /Telephone Number\(s\)\s*:?/i, {
    Qualifier: "qualifier",
    Number: "number",
    Ext: "extension",
    Extension: "extension",
    Type: "type",
    Date: "date",
  });

  const insolvRows = extractMappedRecords<any>(html, /Insolvency\s*:?/i, {
    Type: "type",
    "Date Filed": "dateFiled",
    Status: "status",
    Amount: "amount",
    Discharge: "dateOfDischarge",
    Court: "court",
    Trustee: "trustee",
    Liability: "liabilityAmount",
    Asset: "assetAmount",
    Description: "description",
  });
  
  response.insolvency = insolvRows.map((row: any) => ({
    ...row,
    amount: row.amount
      ? parseFloat(String(row.amount).replace(/[^0-9.-]/g, ""))
      : null,
    liabilityAmount: row.liabilityAmount
      ? parseFloat(String(row.liabilityAmount).replace(/[^0-9.-]/g, ""))
      : null,
    assetAmount: row.assetAmount
      ? parseFloat(String(row.assetAmount).replace(/[^0-9.-]/g, ""))
      : null,
  }));

  // Strict boundary parsing for Inquiries across page breaks
  response.creditRelatedInquiries = extractMappedRecords(html, /Credit Related Inquiries\s*:/i, {
    Date: "date",
    "Authorized User": "authorizedUserName",
    Telephone: "telephone",
  });

  response.nonCreditRelatedInquiries = extractMappedRecords(html, /Non-?Credit Related Inquiries\s*:/i, {
    Date: "date",
    "Authorized User": "authorizedUserName",
    Telephone: "telephone",
  });

  response.accountReviewInquiries = extractMappedRecords(html, /Account Review Inquiries\s*:/i, {
    Date: "date",
    "Authorized User": "authorizedUserName",
    Telephone: "telephone",
  });

  // Aggregate into unified inquiries array
  response.inquiries = [
    ...(response.creditRelatedInquiries || []).map((i) => ({
      ...i,
      type: "Hard",
    })),
    ...(response.nonCreditRelatedInquiries || []).map((i) => ({
      ...i,
      type: "Soft",
    })),
    ...(response.accountReviewInquiries || []).map((i) => ({
      ...i,
      type: "Account Review",
    })),
  ];

  // TransUnion Consumer Statements
  const statementRegex = /<h[1-6][^>]*>\s*Consumer Statement(?:s)?\s*<\/h[1-6]>|<p[^>]*>\s*Consumer Statement(?:s)?\s*<\/p>/i;
  const statementMatch = html.match(statementRegex);
  if (statementMatch) {
    const startIdx = statementMatch.index!;
    const afterHeader = html.substring(startIdx + statementMatch[0].length);
    const endMatch = afterHeader.match(/<h[1-6]|<hr/i);
    const chunk = endMatch ? afterHeader.substring(0, endMatch.index) : afterHeader;
    const text = parseHtmlToRawText(chunk).trim();
    if (text) {
      (response as any).consumerStatements = [{
        statementText: text,
        statementType: "general_statement",
        rawSectionText: chunk
      }];
    }
  } else {
    // Fallback: TransUnion often uses "Special Messages" or "Consumer Message"
    const fallbackMatch = html.match(/(?:Consumer Message|Special Message)[s]?\s*[:\-]/i);
    if (fallbackMatch) {
      const startIdx = fallbackMatch.index!;
      const chunk = html.substring(startIdx).split(/<hr|<h[1-6]/i)[0];
      const text = parseHtmlToRawText(chunk).replace(/^(?:Consumer Message|Special Message)[s]?\s*[:\-]?\s*/i, "").trim();
      if (text) {
        (response as any).consumerStatements = [{
          statementText: text,
          statementType: "general_statement",
          rawSectionText: chunk
        }];
      }
    } else {
      const plainStatementMatch = html.match(/Consumer Statement(?:s)?\s*:/i);
      if (plainStatementMatch) {
        const startIdx = plainStatementMatch.index!;
        const chunk = html.substring(startIdx).split(/<hr|<h[1-6]|\*\*\* This completes the report \*\*\*/i)[0];
        const text = parseHtmlToRawText(chunk).replace(/^<[^>]+>|Consumer Statement(?:s)?\s*:\s*/ig, "").trim();
        if (text) {
          (response as any).consumerStatements = [{
            statementText: text,
            statementType: "general_statement",
            rawSectionText: chunk
          }];
        }
      }
    }
  }

  const accounts = extractAccounts(html);
  if (accounts && accounts.length > 0) {
    response.tradelines = accounts;

    // Report Date Fallback from newest posted date
    if (!response.reportDate) {
      let latestDate = 0;
      let latestDateStr: string | null = null;
      accounts.forEach((t) => {
        if (t.postedDate) {
          const d = new Date(t.postedDate).getTime();
          if (!isNaN(d) && d > latestDate) {
            latestDate = d;
            latestDateStr = t.postedDate;
          }
        }
      });
      if (latestDateStr) {
        response.reportDate = latestDateStr;
      }
    }
  }

  return response;
}