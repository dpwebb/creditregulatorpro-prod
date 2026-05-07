/**
 * Extracted public record from Canadian credit report.
 * Matches the report_public_record table schema.
 */
export type ExtractedPublicRecord = {
  recordType: "bankruptcy" | "civil_judgment" | "foreclosure" | "judgment" | "tax_lien" | "wage_garnishment" | "other";
  filingDate: Date | null;
  dischargeDate: Date | null;
  amount: number | null;
  assetAmount?: number | null;
  liabilityAmount?: number | null;
  exemptAmount?: number | null;
  caseNumber: string | null;
  courtName: string | null;
  courtLocation?: string | null;
  status: string | null;
  plaintiff: string | null;
  trustee?: string | null;
  attorney?: string | null;
  releaseDate?: Date | null;
  satisfiedDate?: Date | null;
  verifiedDate?: Date | null;
  bankruptcyType?: string | null;
  rawSectionText: string;
  confidence: number;
};

/**
 * Extracts public records (bankruptcies, judgments, etc.) from Canadian credit reports.
 * Handles specific Canadian terminology like "Consumer Proposal".
 * Strictly validates to avoid false positives with tradelines.
 */
export function extractPublicRecords(text: string): ExtractedPublicRecord[] {
  console.log(`[PublicRecordExtractor] Starting public record extraction`);
  
  const records: ExtractedPublicRecord[] = [];
  
  // 1. Identify Public Record Section
  const sectionText = extractPublicRecordSection(text);
  if (!sectionText) {
    console.log(`[PublicRecordExtractor] No public records section found`);
    return [];
  }
  
  console.log(`[PublicRecordExtractor] Found public records section (${sectionText.length} chars)`);
  
  // 2. Split into individual records
  // Records are often separated by blank lines or numbered lists
  const chunks = splitRecords(sectionText);
  
  console.log(`[PublicRecordExtractor] Split into ${chunks.length} potential record chunks`);
  
  for (const chunk of chunks) {
    const record = parseRecordChunk(chunk);
    if (record) {
      records.push(record);
    }
  }

  console.log(`[PublicRecordExtractor] Successfully extracted ${records.length} public records`);
  return records;
}

/**
 * Extracts the public records section from the full credit report text.
 * Only looks for clearly labeled PUBLIC RECORDS sections.
 */
function extractPublicRecordSection(text: string): string | null {
  const lines = text.split('\n');
  let inSection = false;
  let buffer: string[] = [];
  
  // STRICT: Only recognize clearly labeled public record sections
  const startHeaders = [
    /^\s*\d+\.\s*PUBLIC\s+RECORDS?/i,          // "10. PUBLIC RECORDS"
    /^\s*PUBLIC\s+RECORDS?/i,                  // "PUBLIC RECORDS"
    // We explicitly EXCLUDE numbered subtypes (e.g. "1. Bankruptcy") to prevent
    // mistaking items within the section as new section headers.
    /^\s*BANKRUPTC(?:Y|IES)/i,                 // "BANKRUPTCIES" (Standalone)
    /^\s*(?:CIVIL\s+)?JUDGMENTS?/i,            // "JUDGMENTS" (Standalone)
    /^\s*(?:TAX\s+)?LIENS?/i,                  // "LIENS" (Standalone)
    /^\s*LEGAL\s+ITEMS?/i,                     // "LEGAL ITEMS" (Standalone)
    /^\s*REGISTERED\s+ITEMS?/i,                // "REGISTERED ITEMS" (Standalone)
  ];
  
    // Patterns for next section (where to stop)
  // Only stop on numbered sections that are clearly NOT public record items
  // Use a whitelist approach: stop on known non-public-record sections
  const endHeaders = [
    /^\s*\d+\.\s*(?:TRADE|CREDIT|ACCOUNT|INQUIR|STATEMENT|SCORE|EMPLOYMENT|ADDRESS|CONSUMER)/i,  // Non-PR numbered sections
    /^\s*(?:TRADE|CREDIT|COLLECTION|INQUIR|STATEMENT|SCORE|EMPLOYMENT|ADDRESS|CONTACT|CONSUMER\s+INFO)/i,  // Standalone non-PR headers
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if we're starting the public records section
    if (!inSection && startHeaders.some(pattern => pattern.test(trimmed))) {
      console.log(`[PublicRecordExtractor] Found public records section start: "${trimmed}"`);
      inSection = true;
      continue; // Skip the header line itself
    }
    
    // Check if we've reached the next section
    if (inSection && endHeaders.some(pattern => pattern.test(trimmed))) {
      console.log(`[PublicRecordExtractor] Found public records section end: "${trimmed}"`);
      break;
    }
    
    if (inSection) {
      buffer.push(line);
    }
  }
  
  const sectionText = buffer.length > 0 ? buffer.join('\n') : null;
  
  // Additional validation: The section must contain public record keywords
  if (sectionText) {
    const hasPublicRecordKeywords = /(?:bankruptcy|bankrupt|judgment|judgement|lien|foreclosure|garnishment|consumer\s+proposal|division\s+[1I]|chapter\s+\d+)/i.test(sectionText);
    
    if (!hasPublicRecordKeywords) {
      console.log(`[PublicRecordExtractor] Section found but contains no public record keywords, ignoring`);
      return null;
    }
  }
  
  return sectionText;
}

/**
 * Splits public records section into individual record chunks.
 */
function splitRecords(text: string): string[] {
  // Split by double newlines or numbered lists
  const chunks = text.split(/\n\s*\n/).filter(c => c.trim().length > 20);
  
  // Also try to split by numbered entries like "1.", "2.", etc. within the text
  const numberedSplit: string[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    let currentRecord: string[] = [];
    
    for (const line of lines) {
      // Check if line starts with a number followed by period (e.g., "1. Bankruptcy")
      if (/^\s*\d+\.\s+/.test(line) && currentRecord.length > 0) {
        numberedSplit.push(currentRecord.join('\n'));
        currentRecord = [line];
      } else {
        currentRecord.push(line);
      }
    }
    
    if (currentRecord.length > 0) {
      numberedSplit.push(currentRecord.join('\n'));
    }
  }
  
  return numberedSplit.length > chunks.length ? numberedSplit : chunks;
}

/**
 * Parses a chunk of text into an ExtractedPublicRecord.
 * Strictly validates to avoid false positives with tradelines.
 */
function parseRecordChunk(chunk: string): ExtractedPublicRecord | null {
  const lower = chunk.toLowerCase();
  
  // STRICT VALIDATION: Check for tradeline-specific patterns that should DISQUALIFY this chunk
  const tradelineBlacklist = [
    /\b[RIMO]\d\b/,                                  // Payment ratings (R1, I2, M1, O1)
    /credit\s+limit/i,                                // Credit limit
    /\b(?:revolving|installment|mortgage)\b/i,        // Account types
    /monthly\s+payment/i,                             // Monthly payment
    /payment\s+history/i,                             // Payment history
    /\b1{3,}\b/,                                      // Payment pattern (111111111)
    /account\s+(?:number|#)/i,                        // Account number
    /high\s+(?:balance|credit)/i,                     // High balance/credit
    /current\s+balance/i,                             // Current balance
    /past\s+due/i,                                    // Past due
    /date\s+opened/i,                                 // Date opened (common in tradelines)
    /last\s+payment/i,                                // Last payment
  ];
  
  for (const pattern of tradelineBlacklist) {
    if (pattern.test(chunk)) {
      console.log(`[PublicRecordExtractor] Rejecting chunk due to tradeline pattern: ${pattern}`);
      return null;
    }
  }
  
  // 1. Determine Type (must have one of these keywords to be valid)
  let recordType: ExtractedPublicRecord["recordType"] = "other";
  let hasValidKeyword = false;
  
  if (lower.includes("bankruptcy") || lower.includes("bankrupt")) {
    recordType = "bankruptcy";
    hasValidKeyword = true;
  } else if (lower.includes("consumer proposal") || lower.includes("division 1") || lower.includes("division i")) {
    recordType = "bankruptcy"; // Consumer Proposal is treated as bankruptcy-related in Canada
    hasValidKeyword = true;
  } else if (lower.includes("chapter 7") || lower.includes("chapter 13")) {
    recordType = "bankruptcy"; // US bankruptcy chapters
    hasValidKeyword = true;
  } else if (lower.includes("judgment") || lower.includes("judgement")) {
    recordType = "judgment";
    hasValidKeyword = true;
  } else if (lower.includes("civil judgment") || lower.includes("civil judgement")) {
    recordType = "civil_judgment";
    hasValidKeyword = true;
  } else if (lower.includes("lien")) {
    recordType = "tax_lien";
    hasValidKeyword = true;
  } else if (lower.includes("foreclosure")) {
    recordType = "foreclosure";
    hasValidKeyword = true;
  } else if (lower.includes("garnishment")) {
    recordType = "wage_garnishment";
    hasValidKeyword = true;
  }
  
  // If no valid public record keyword found, reject
  if (!hasValidKeyword) {
    console.log(`[PublicRecordExtractor] Rejecting chunk - no valid public record keyword found`);
    return null;
  }
  
  // 2. Extract Dates
  let filingDate: Date | null = null;
  let dischargeDate: Date | null = null;
  let releaseDate: Date | null = null;
  let satisfiedDate: Date | null = null;
  let verifiedDate: Date | null = null;
  
  const datePattern = /(\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4})/;
  
  // Look for specific date labels
  const filedMatch = chunk.match(new RegExp(`(?:Filed|Filing\s+Date|Date\s+Filed|Reported)[^\\d]*${datePattern.source}`, 'i'));
  if (filedMatch) {
    filingDate = parsePublicRecordDate(filedMatch[1]);
  }
  
  const dischargeMatch = chunk.match(new RegExp(`(?:Discharged|Discharge\s+Date|Satisfied|Released)[^\\d]*${datePattern.source}`, 'i'));
  if (dischargeMatch) {
    dischargeDate = parsePublicRecordDate(dischargeMatch[1]);
  }

  const releaseMatch = chunk.match(new RegExp(`(?:Released|Release\\s+Date)[^\\d]*${datePattern.source}`, 'i'));
  if (releaseMatch) {
    releaseDate = parsePublicRecordDate(releaseMatch[1]);
  }

  const satisfiedMatch = chunk.match(new RegExp(`(?:Satisfied|Satisfaction\\s+Date)[^\\d]*${datePattern.source}`, 'i'));
  if (satisfiedMatch) {
    satisfiedDate = parsePublicRecordDate(satisfiedMatch[1]);
  }

  const verifiedMatch = chunk.match(new RegExp(`(?:Verified|Verification\\s+Date|Date\\s+Verified)[^\\d]*${datePattern.source}`, 'i'));
  if (verifiedMatch) {
    verifiedDate = parsePublicRecordDate(verifiedMatch[1]);
  }
  
  // Fallback: just grab first date if no label match
  if (!filingDate) {
    const anyDate = chunk.match(datePattern);
    if (anyDate) {
      filingDate = parsePublicRecordDate(anyDate[1]);
    }
  }

  // 3. Extract Amount
  let amount: number | null = null;
  const amountMatch = chunk.match(/(?:Amount|Liability|Assets?|Debt)[\s:]+\$[\s]*([\d,]+(?:\.\d{2})?)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  } else {
    // Try to find any dollar amount
    const anyAmountMatch = chunk.match(/\$[\s]*([\d,]+(?:\.\d{2})?)/);
    if (anyAmountMatch) {
      amount = parseFloat(anyAmountMatch[1].replace(/,/g, ''));
    }
  }

  const amountAfter = (label: RegExp): number | null => {
    const match = chunk.match(new RegExp(`${label.source}[\\s:]+\\$?\\s*([\\d,]+(?:\\.\\d{2})?)`, "i"));
    if (!match) return null;
    const parsed = parseFloat(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const assetAmount = amountAfter(/Assets?|Asset\s+Amount/i);
  const liabilityAmount = amountAfter(/Liabilit(?:y|ies)|Liability\s+Amount/i);
  const exemptAmount = amountAfter(/Exempt(?:ion)?(?:\s+Amount)?/i);

  // 4. Extract Case/Docket Number
  let caseNumber: string | null = null;
  const caseMatch = chunk.match(/(?:Case|Docket|File|Reference)\s*(?:#|No\.?|Number)?[\s:]*([A-Z0-9-]+)/i);
  if (caseMatch) {
    caseNumber = caseMatch[1];
  }

  // 5. Extract Court
  let courtName: string | null = null;
  let courtLocation: string | null = null;
  const courtMatch = chunk.match(/Court[\s:]+([^\n]+)/i);
  if (courtMatch) {
    courtName = courtMatch[1].trim();
  }
  courtLocation = chunk.match(/Location[\s:]+([^\n]+)/i)?.[1]?.trim() ?? null;

  // 6. Extract Status
  let status: string | null = null;
  const statusMatch = chunk.match(/Status[\s:]+([^\n]+)/i);
  if (statusMatch) {
    status = statusMatch[1].trim();
  } else {
    // Infer status from keywords
    if (lower.includes("discharged")) status = "Discharged";
    else if (lower.includes("dismissed")) status = "Dismissed";
    else if (lower.includes("satisfied")) status = "Satisfied";
    else if (lower.includes("released")) status = "Released";
    else if (lower.includes("filed")) status = "Filed";
    else if (lower.includes("active")) status = "Active";
  }

  // 7. Extract Plaintiff (for judgments)
  let plaintiff: string | null = null;
  if (recordType === "judgment" || recordType === "civil_judgment") {
    const plaintiffMatch = chunk.match(/(?:Plaintiff|Creditor)[\s:]+([^\n]+)/i);
    if (plaintiffMatch) {
      plaintiff = plaintiffMatch[1].trim();
    }
  }

  const trustee = chunk.match(/Trustee[\s:]+([^\n]+)/i)?.[1]?.trim() ?? null;
  const attorney = chunk.match(/Attorney[\s:]+([^\n]+)/i)?.[1]?.trim() ?? null;
  const bankruptcyType =
    recordType === "bankruptcy"
      ? chunk.match(/(?:Bankruptcy|Proposal)\s+Type[\s:]+([^\n]+)/i)?.[1]?.trim() ??
        (lower.includes("consumer proposal") ? "Consumer Proposal" : lower.includes("division i") || lower.includes("division 1") ? "Division I Proposal" : null)
      : null;

  // Final validation: Must have at least a date OR amount OR case number to be valid
  if (!filingDate && !amount && !caseNumber) {
    console.log(`[PublicRecordExtractor] Rejecting chunk - no date, amount, or case number found`);
    return null;
  }

  return {
    recordType,
    filingDate,
    dischargeDate,
    amount,
    assetAmount,
    liabilityAmount,
    exemptAmount,
    caseNumber,
    courtName,
    courtLocation,
    status,
    plaintiff,
    trustee,
    attorney,
    releaseDate,
    satisfiedDate,
    verifiedDate,
    bankruptcyType,
    rawSectionText: chunk,
    confidence: 85,
  };
}

/**
 * Parses a date string into a Date object.
 */
function parsePublicRecordDate(dateStr: string): Date | null {
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
  
  // Fallback: try native Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;
  
  return null;
}
