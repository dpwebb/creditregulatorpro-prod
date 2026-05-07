/**
 * Extracted inquiry from Canadian credit report.
 * Matches the report_inquiry table schema.
 */
export type ExtractedInquiry = {
  inquiryType: "hard" | "soft" | "promotional" | "unknown";
  creditorName: string;
  inquiryDate: Date | null;
  inquiryPurpose: string | null;
  subscriberCode: string | null;
  industryCode: string | null;
  phone?: string | null;
  rawSectionText: string;
  confidence: number;
};

import { extractTransUnionSection } from "./transunionTextParsing";

const TEXT_DATE_PATTERN_SOURCE =
  "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2},?\\s+\\d{4}";

/**
 * Extracts credit inquiries from Canadian credit report text.
 * Handles various Canadian report formats including numbered sections and different separators.
 */
export function extractInquiries(text: string): ExtractedInquiry[] {
  console.log(`[InquiryExtractor] Starting inquiry extraction`);
  
  const inquiries: ExtractedInquiry[] = [];

  const transUnionInquiries = extractTransUnionInquiries(text);
  if (transUnionInquiries.length > 0) {
    console.log(`[InquiryExtractor] Successfully extracted ${transUnionInquiries.length} TransUnion inquiries`);
    return transUnionInquiries;
  }
  
  // 1. Find the inquiries section
  const inquirySection = extractInquirySection(text);
  
  if (!inquirySection) {
    console.log(`[InquiryExtractor] No inquiry section found`);
    return [];
  }
  
  console.log(`[InquiryExtractor] Found inquiry section (${inquirySection.length} chars)`);
  
  // 2. Look for subsections (Hard vs Soft)
  const subsections = splitInquirySubsections(inquirySection);
  
  if (subsections.length > 0) {
    console.log(`[InquiryExtractor] Found ${subsections.length} inquiry subsections`);
    
    for (const subsection of subsections) {
      const lines = subsection.text.split('\n').filter(l => l.trim().length > 0);
      
      for (const line of lines) {
        const parsed = parseInquiryLine(line, subsection.type);
        if (parsed) {
          inquiries.push(parsed);
        }
      }
    }
  } else {
    // No subsections found, parse all lines and infer type from keywords
    console.log(`[InquiryExtractor] No subsections found, parsing all lines`);
    const lines = inquirySection.split('\n').filter(l => l.trim().length > 0);
    
    for (const line of lines) {
      const parsed = parseInquiryLine(line, null);
      if (parsed) {
        inquiries.push(parsed);
      }
    }
  }

  console.log(`[InquiryExtractor] Successfully extracted ${inquiries.length} inquiries`);
  return inquiries;
}

function extractTransUnionInquiries(text: string): ExtractedInquiry[] {
  const sections: Array<{
    startPatterns: RegExp[];
    inquiryType: ExtractedInquiry["inquiryType"];
  }> = [
    { startPatterns: [/Credit Related Inquiries\s*:/i], inquiryType: "hard" },
    { startPatterns: [/Non-?Credit Related Inquiries\s*:/i], inquiryType: "soft" },
    { startPatterns: [/Account Review Inquiries\s*:/i], inquiryType: "soft" },
  ];

  const results: ExtractedInquiry[] = [];
  for (const sectionConfig of sections) {
    const section = extractTransUnionSection(text, sectionConfig.startPatterns);
    if (!section) continue;
    results.push(...parseTransUnionInquirySection(section, sectionConfig.inquiryType));
  }

  const unique = new Map<string, ExtractedInquiry>();
  for (const inquiry of results) {
    const key = `${inquiry.inquiryType}|${inquiry.creditorName.toUpperCase()}|${inquiry.inquiryDate?.getTime() ?? "unknown"}`;
    if (!unique.has(key)) unique.set(key, inquiry);
  }

  return Array.from(unique.values());
}

function parseTransUnionInquirySection(
  section: string,
  inquiryType: ExtractedInquiry["inquiryType"],
): ExtractedInquiry[] {
  const results: ExtractedInquiry[] = [];
  const rowPattern = new RegExp(
    `(${TEXT_DATE_PATTERN_SOURCE})([\\s\\S]*?)(?=${TEXT_DATE_PATTERN_SOURCE}|$)`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const dateString = match[1].replace(/\s+/g, " ").trim();
    const remainder = (match[2] ?? "").replace(/\s+/g, " ").trim();
    const inquiryDate = parseInquiryDate(dateString);
    if (!inquiryDate || remainder.length < 2) continue;

    const phoneMatch = remainder.match(/(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[2-9]\d{9})/);
    const withoutPhone = phoneMatch
      ? `${remainder.slice(0, phoneMatch.index)} ${remainder.slice((phoneMatch.index ?? 0) + phoneMatch[0].length)}`
      : remainder;
    const creditorName = withoutPhone
      .replace(/^(?:Date|Authorized User|Name|Telephone)\s*/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!creditorName || /^(date|authorized user|telephone|not applicable)$/i.test(creditorName)) {
      continue;
    }

    results.push({
      inquiryType,
      creditorName,
      inquiryDate,
      inquiryPurpose: inquiryType === "hard" ? "Credit Related Inquiry" : "Non-credit/account review inquiry",
      subscriberCode: null,
      industryCode: null,
      phone: phoneMatch?.[0]?.trim() ?? null,
      rawSectionText: `${dateString} ${remainder}`.trim(),
      confidence: 90,
    });
  }

  return results;
}

/**
 * Extracts the inquiry section from the full credit report text.
 * Looks for patterns like "INQUIRIES", "10. INQUIRIES", etc.
 */
function extractInquirySection(text: string): string | null {
  const lines = text.split('\n');
  let inSection = false;
  let buffer: string[] = [];
  
  // Patterns for inquiry section start
  const startPatterns = [
    /^\s*\d+\.\s*INQUIR(?:IES|Y)/i, // "10. INQUIRIES"
    /^\s*INQUIR(?:IES|Y)/i,          // "INQUIRIES" or "INQUIRY"
    /CREDIT\s+INQUIR(?:IES|Y)/i,     // "CREDIT INQUIRIES"
  ];
  
  // Patterns for next section (where to stop)
  const stopPatterns = [
    /^\s*\d+\.\s*(?!INQUIR)[A-Z]/,   // Any numbered section that's not inquiries
    /^\s*(?:CONSUMER\s+STATEMENT|PERSONAL\s+INFORMATION|SCORE|RATING)/i,
  ];

      for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if we're starting the inquiry section
    if (!inSection && startPatterns.some(pattern => pattern.test(trimmed))) {
      console.log(`[InquiryExtractor] Found inquiry section start: "${trimmed}"`);
      inSection = true;
      continue; // Skip the header line itself
    }
    
    // Check if we've reached the next section
    if (inSection && stopPatterns.some(pattern => pattern.test(trimmed))) {
      console.log(`[InquiryExtractor] Found inquiry section end: "${trimmed}"`);
      break;
    }
    
    if (inSection) {
      buffer.push(line);
    }
  }
  
  return buffer.length > 0 ? buffer.join('\n') : null;
}

type InquirySubsection = {
  text: string;
  type: "hard" | "soft" | "promotional";
};

/**
 * Splits inquiry section into subsections (hard vs soft).
 * Some reports have explicit subsections like "Inquiries that affected your score".
 */
function splitInquirySubsections(text: string): InquirySubsection[] {
  const subsections: InquirySubsection[] = [];
  const lines = text.split('\n');
  
  let currentBuffer: string[] = [];
  let currentType: "hard" | "soft" | "promotional" | null = null;
  
  // Patterns for subsection headers
  const hardPatterns = [
    /(?:inquir(?:ies|y)\s+that\s+affected|hard\s+inquir|credit\s+inquir(?:ies|y)|regular\s+inquir)/i,
  ];
  
    // Note: These patterns should match EXPLICIT section headers, not individual inquiry lines
  // We removed "service inquir" from here because "Service Inquiry" is often a purpose, not a header
  const softPatterns = [
    /(?:inquir(?:ies|y)\s+that\s+did\s+not\s+affect|soft\s+inquir(?:ies|y)|account\s+review\s+inquir)/i,
  ];
  
  const promoPatterns = [
    /promotional\s+inquir/i,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for subsection headers
    let foundHeader = false;
    
    if (hardPatterns.some(p => p.test(trimmed))) {
      if (currentType && currentBuffer.length > 0) {
        subsections.push({ text: currentBuffer.join('\n'), type: currentType });
      }
      currentType = "hard";
      currentBuffer = [];
      foundHeader = true;
    } else if (promoPatterns.some(p => p.test(trimmed))) {
      if (currentType && currentBuffer.length > 0) {
        subsections.push({ text: currentBuffer.join('\n'), type: currentType });
      }
      currentType = "promotional";
      currentBuffer = [];
      foundHeader = true;
    } else if (softPatterns.some(p => p.test(trimmed))) {
      if (currentType && currentBuffer.length > 0) {
        subsections.push({ text: currentBuffer.join('\n'), type: currentType });
      }
      currentType = "soft";
      currentBuffer = [];
      foundHeader = true;
    }
    
    if (!foundHeader && currentType) {
      currentBuffer.push(line);
    }
  }
  
  // Push final buffer
  if (currentType && currentBuffer.length > 0) {
    subsections.push({ text: currentBuffer.join('\n'), type: currentType });
  }
  
  return subsections;
}

/**
 * Parses a single inquiry line into an ExtractedInquiry object.
 * Handles various formats:
 * - "2025-10-11 – RBC – Credit Application"
 * - "Oct 11, 2025 RBC Credit Application"
 * - "2025-10-11 | RBC | Account Review"
 * - "01/15/2023  TD CANADA TRUST  (514) 555-0123"
 */
function parseInquiryLine(line: string, explicitType: "hard" | "soft" | "promotional" | null): ExtractedInquiry | null {
  const trimmed = line.trim();
  
  // Skip empty lines and header lines
  if (trimmed.length < 10) return null;
  if (/^(?:date|creditor|inquiry|name|type)/i.test(trimmed)) return null;
  
  // Pattern 1: "2025-10-11 – RBC – Credit Application" or similar with separators
  const separatorPattern = /^([0-9-\/]+)\s*[–\-|]\s*([^–\-|]+?)(?:\s*[–\-|]\s*(.+))?$/;
  const separatorMatch = trimmed.match(separatorPattern);
  
  if (separatorMatch) {
    const dateStr = separatorMatch[1].trim();
    const creditor = separatorMatch[2].trim();
    const purpose = separatorMatch[3]?.trim() || null;
    
    const date = parseInquiryDate(dateStr);
    if (date && creditor.length >= 2) {
      const inferredType = explicitType || inferInquiryType(purpose);
      
      return {
        inquiryType: inferredType,
        creditorName: creditor,
        inquiryDate: date,
        inquiryPurpose: purpose,
        subscriberCode: null,
        industryCode: null,
        phone: null,
        rawSectionText: trimmed,
        confidence: 85,
      };
    }
  }
  
  // Pattern 2: "Oct 11, 2025 RBC Credit Application" (date + creditor + purpose)
  const datePattern = /(\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i;
  const dateMatch = trimmed.match(datePattern);
  
  if (dateMatch) {
    const dateStr = dateMatch[1];
    const date = parseInquiryDate(dateStr);
    
    if (date) {
      // Remove date from line
      const remainder = trimmed.replace(dateStr, '').trim();
      
      // Remove phone numbers if present
      const phoneMatch = remainder.match(/\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/);
      const withoutPhone = remainder.replace(/\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/g, '').trim();
      
      // Extract subscriber code if present
      let subscriberCode: string | null = null;
      let withoutSubCode = withoutPhone;
      const subMatch = withoutPhone.match(/(?:Member|Sub|Code)[\s#:]*([A-Z0-9]+)/i);
      if (subMatch) {
        subscriberCode = subMatch[1];
        withoutSubCode = withoutPhone.replace(subMatch[0], '').trim();
      }
      
      // Split remaining text into creditor and purpose
      // Usually creditor is all caps or title case, purpose is descriptive
      let creditor: string;
      let purpose: string | null = null;
      
      // Try to split by common purpose keywords
      const purposeKeywords = [
        'Credit Application',
        'Pre-Approval',
        'Pre-Approved',
        'Account Review',
        'Service Inquiry',
        'Promotional',
        'Application',
        'Inquiry',
        'Review'
      ];
      
      let splitIndex = -1;
      for (const keyword of purposeKeywords) {
        const idx = withoutSubCode.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx > 0) {
          splitIndex = idx;
          purpose = withoutSubCode.substring(idx).trim();
          break;
        }
      }
      
      if (splitIndex > 0) {
        creditor = withoutSubCode.substring(0, splitIndex).trim();
      } else {
        // No purpose found, treat entire remainder as creditor
        creditor = withoutSubCode.trim();
      }
      
      if (creditor.length >= 2) {
        const inferredType = explicitType || inferInquiryType(purpose);
        
        return {
          inquiryType: inferredType,
          creditorName: creditor,
          inquiryDate: date,
          inquiryPurpose: purpose,
          subscriberCode,
          industryCode: null,
          phone: phoneMatch?.[0]?.trim() ?? null,
          rawSectionText: trimmed,
          confidence: 80,
        };
      }
    }
  }
  
  return null;
}

/**
 * Parses various date formats into a Date object.
 */
function parseInquiryDate(dateStr: string): Date | null {
  const trimmed = dateStr.trim();
  
  // Format: YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Format: MM/DD/YYYY or MM-DD-YYYY
  if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(/[-\/]/);
    const date = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Format: "Oct 11, 2025" or "October 11 2025"
  const monthPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i;
  const monthMatch = trimmed.match(monthPattern);
  if (monthMatch) {
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = monthMap[monthMatch[1].toLowerCase().substring(0, 3)];
    const day = monthMatch[2].padStart(2, '0');
    const year = monthMatch[3];
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Fallback: try native Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;
  
  return null;
}

/**
 * Infers inquiry type from the purpose/description.
 * Hard inquiries: Credit Application, Pre-Approval, Loan Application
 * Soft inquiries: Account Review, Service Inquiry, Promotional
 */
function inferInquiryType(purpose: string | null): "hard" | "soft" | "promotional" | "unknown" {
  if (!purpose) return "unknown";
  
  const lower = purpose.toLowerCase();
  
  // Hard inquiry keywords
  if (lower.includes('credit application') || 
      lower.includes('loan application') ||
      lower.includes('pre-approval') ||
      lower.includes('pre-approved') ||
      lower.includes('application')) {
    return "hard";
  }
  
  // Promotional inquiry keywords
  if (lower.includes('promotional') || 
      lower.includes('pre-screen') ||
      lower.includes('prescreened')) {
    return "promotional";
  }
  
  // Soft inquiry keywords
  if (lower.includes('account review') || 
      lower.includes('service inquiry') ||
      lower.includes('monitoring') ||
      lower.includes('review')) {
    return "soft";
  }
  
  // Default to unknown
  return "unknown";
}
