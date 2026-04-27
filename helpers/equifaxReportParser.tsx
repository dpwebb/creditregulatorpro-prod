import { LLMResponse } from "./docstrangeLLM";
import {
  parseEqPersonalInfo,
  parseEqCreditScore,
  parseEqAccounts,
  parseEqCollections,
  parseEqInquiries,
  parseEqConsumerStatements,
  parseEqEmployment
} from "./equifaxAccountParser";
import { extractMappedRecords } from "./_htmlParserUtils";

export { 
  parseEquifaxSections, 
  extractEquifaxTradelinesFromSection, 
  extractEquifaxTradeline 
} from "./equifaxPdfExtractor";

/**
 * Quick heuristic to determine if the text is from an Equifax Canada report.
 */
export function isEquifaxFormat(text: string): boolean {
  if (!text) return false;
  const upperText = text.toUpperCase();
  // Look for specific Equifax markers
  return upperText.includes("EQUIFAX") && 
         (upperText.includes("BEACON") || 
          upperText.includes("CREDIT SCORE") || 
          upperText.includes("ECRS") ||
          upperText.includes("CONSUMER DISCLOSURE") ||
          upperText.includes("CREDIT INFORMATION") ||
          upperText.includes("PERSONAL INFORMATION") ||
          upperText.includes("H1S 2Z2") ||
          upperText.includes("1-800-465-7166"));
}

export function parseEquifaxHtmlToLLMResponse(html: string): LLMResponse {
  const response: LLMResponse = {
    bureau: "Equifax",
    reportDate: null,
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

  // Extract Report Date
  const reqDateMatch = html.match(/Request Date\s+(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  if (reqDateMatch) {
    response.reportDate = reqDateMatch[1];
  }

  // Extract EQ Reference Number
  let eqReferenceNumber = null;
  const refNumMatch = html.match(/EQUIFAX REFERENCE NUMBER\s*:\s*(\d+)/i);
  if (refNumMatch) {
    eqReferenceNumber = refNumMatch[1];
  } else {
    // Alternatively, look for "Personal File Number" in tables or raw text
    const pfnMatch = html.match(/Personal File Number\s*<\/t[dh]>\s*<(?:td|th)[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (pfnMatch) {
      const pfnText = pfnMatch[1].replace(/<[^>]+>/g, "").trim();
      if (/^\d+$/.test(pfnText)) eqReferenceNumber = pfnText;
    } else {
      const textPfnMatch = html.match(/Personal File Number\s*(?:<\/?[^>]+>\s*)*:\s*(?:<\/?[^>]+>\s*)*(\d+)/i);
      if (textPfnMatch) eqReferenceNumber = textPfnMatch[1];
    }
  }

  if (eqReferenceNumber) {
    (response as any).eqReferenceNumber = eqReferenceNumber;
  }

  const pInfo = parseEqPersonalInfo(html);
  if (pInfo) {
    response.personalInfo = {
      surname: pInfo.surname,
      givenNames: pInfo.givenNames,
      middleName: pInfo.middleName,
      birthDate: pInfo.birthDate,
      socialInsuranceNo: pInfo.socialInsuranceNo,
    };
    response.consumerInfo!.fullName = [pInfo.givenNames, pInfo.middleName, pInfo.surname].filter(Boolean).join(" ");
    response.consumerInfo!.dateOfBirth = pInfo.birthDate;
    
    if (pInfo.addresses.length > 0) {
      const formatAddr = (a: any) => [a.address, a.city, a.province, a.postalCode].filter(Boolean).join(", ");
      const current = pInfo.addresses.find((a: any) => a.type.toLowerCase() === "current");
      response.consumerInfo!.currentAddress = current ? formatAddr(current) : formatAddr(pInfo.addresses[0]);
      response.consumerInfo!.previousAddresses = pInfo.addresses.filter((a: any) => a.type.toLowerCase() !== "current").map(formatAddr);
    }
    
    response.telephoneNumbers = pInfo.telephones;
    response.addresses = pInfo.addresses.map((a: any) => ({
      address: a.address,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
      type: a.type,
      sinceDate: a.reportedDate,
    }));
  }

  const scoreInfo = parseEqCreditScore(html);
  if (scoreInfo && scoreInfo.score) {
    response.scores!.push({
      score: scoreInfo.score,
      scoreType: "Equifax Credit Score",
      date: scoreInfo.date || response.reportDate,
    });
  }

  if (pInfo && pInfo.employers && pInfo.employers.length > 0) {
    response.consumerInfo!.employers = pInfo.employers.map((emp: any) => emp.employerName).filter(Boolean);
    response.employments = pInfo.employers.map((emp: any) => ({
      employerNameCityProvince: emp.employerName,
      occupation: emp.type
    }));
  } else {
    const employments = parseEqEmployment(html);
    if (employments && employments.length > 0) {
      response.employments = employments.map((emp: any) => ({
        employerNameCityProvince: emp.employerName || emp.employerNameCityProvince,
        occupation: emp.type || emp.occupation
      }));
      response.consumerInfo!.employers = employments
        .map((emp: any) => emp.employerName || emp.employerNameCityProvince)
        .filter(Boolean);
    }
  }

  const accounts = parseEqAccounts(html);
  const collections = parseEqCollections(html);
  response.tradelines = [...accounts, ...collections];

  const inquiries = parseEqInquiries(html);
  response.inquiries = inquiries;
  
  response.creditRelatedInquiries = inquiries.filter((i: any) => i.type === "Hard");
  response.nonCreditRelatedInquiries = inquiries.filter((i: any) => i.type === "Soft");

  const consumerStatements = parseEqConsumerStatements(html);
  if (consumerStatements.length > 0) {
    (response as any).consumerStatements = consumerStatements;
  }

  const alertsDisclosures = extractMappedRecords(html, /Alerts, Disclosures And Contact History/i, {
    "Service Type": "serviceType",
    "Details": "details",
    "Date Reported": "dateReported",
    "Compliance Date": "complianceDate"
  });
  if (alertsDisclosures && alertsDisclosures.length > 0) {
    (response as any).alertsDisclosures = alertsDisclosures;
  }

  return response;
}