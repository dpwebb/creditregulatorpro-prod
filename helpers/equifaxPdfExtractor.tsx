import type { ParsedTradeline } from "./reportParserTypes";

/**
 * Extracts tradelines strictly from Equifax Canadian text formats (e.g. OCR PDF text).
 * Handles the tabular structure uniquely assigned to Equifax documents where values are aligned in distinct column widths.
 *
 * @param text The extracted text from a credit report PDF
 * @returns Array of parsed tradelines
 */
export function extractEquifaxTradelines(text: string): ParsedTradeline[] {
  console.log(`[Equifax PDF Extract] Processing ${text.length} characters of text`);
  const sections = parseEquifaxSections(text);
  const tradelines: ParsedTradeline[] = [];
  
  // Extract from the sections explicitly known to contain tradelines
  if (sections["credit"]) {
    tradelines.push(...extractEquifaxTradelinesFromSection(sections["credit"]));
  }
  if (sections["collections"]) {
    const colTradelines = extractEquifaxTradelinesFromSection(sections["collections"]);
    for (const tl of colTradelines) {
      tl.isCollectionAccount = true;
      tl.accountType = "Collection";
    }
    tradelines.push(...colTradelines);
  }

  // Fallback if structured sections were not correctly detected due to severe OCR drift
  if (tradelines.length === 0) {
     console.log(`[Equifax PDF Extract] Structured sections not found or empty. Using fallback global extraction.`);
     return extractEquifaxTradelinesFromSection(text);
  }

  console.log(`[Equifax PDF Extract] Successfully parsed ${tradelines.length} tradelines`);
  return tradelines;
}

/**
 * Splits raw Equifax report text into logical sections based on common headers.
 */
export function parseEquifaxSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  
  // Typical Equifax Canada headers
  const headers = [
    { key: "personal", regex: /\b(?:PERSONAL|IDENTIFICATION) INFORMATION\b/i },
    { key: "credit", regex: /\bCREDIT INFORMATION\b/i },
    { key: "public", regex: /\bPUBLIC RECORDS\b/i },
    { key: "inquiries", regex: /\bINQUIRIES\b/i },
    { key: "collections", regex: /\bCOLLECTIONS\b/i },
    { key: "statements", regex: /\bCONSUMER STATEMENT\b/i },
  ];

  let remainingText = text;
  
  // Simple chunking based on regex match indices
  const indices = headers.map(h => {
    const match = remainingText.match(h.regex);
    return { key: h.key, index: match ? match.index! : -1 };
  }).filter(h => h.index !== -1).sort((a, b) => a.index - b.index);

  for (let i = 0; i < indices.length; i++) {
    const current = indices[i];
    const nextIndex = i + 1 < indices.length ? indices[i+1].index : remainingText.length;
    sections[current.key] = remainingText.substring(current.index, nextIndex).trim();
  }

  return sections;
}

/**
 * Extracts multiple tradelines from a given text section by splitting blocks.
 */
export function extractEquifaxTradelinesFromSection(sectionText: string): ParsedTradeline[] {
  // Heuristic: split by double newlines to separate discrete tabular blocks
  const blocks = sectionText.split(/\n\s*\n+/);
  const tradelines: ParsedTradeline[] = [];
  
  for (const block of blocks) {
    const tl = extractEquifaxTradeline(block);
    // Ignore empty/failed parses
    if (tl && tl.accountNumber !== "Unknown") {
      tradelines.push(tl);
    }
  }
  return tradelines;
}

/**
 * Extracts a single tradeline from an Equifax specific block of text.
 * Captures unique Canadian rating codes (R1-R9, I1-I9, M1-M9) and horizontal layout data.
 */
export function extractEquifaxTradeline(sectionText: string): ParsedTradeline | null {
  if (!sectionText || sectionText.length < 10) return null;

  // Attempt to parse out standard Equifax rating codes (e.g., R1, I9, M1)
  const ratingMatch = sectionText.match(/\b([RIM][1-9])\b/i);
  const status = ratingMatch ? ratingMatch[1].toUpperCase() : "Unknown";

  // Balance extraction
  const balanceMatch = sectionText.match(/(?:Balance|Bal)[^\d]*\$?\s*([\d,]+\.\d{2})/i);
  const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, "")) : 0;

  const pastDueMatch = sectionText.match(/(?:Past Due|Amount Past Due)[^\d]*\$?\s*([\d,]+\.\d{2})/i);
  const pastDue = pastDueMatch ? parseFloat(pastDueMatch[1].replace(/,/g, "")) : 0;

  // Account number extraction
  const accMatch = sectionText.match(/(?:Account|Acct|A\/C)(?:\s*(?:#|No\.?|Number))?\s*[:\-]?\s*([X\*0-9A-Z]{4,20})/i);
  const accountNumber = accMatch ? accMatch[1] : "Unknown";

  // Creditor name extraction - naive heuristic that it precedes the account number or is at the top of the tabular row
  const lines = sectionText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const skipHeaders = ["CREDIT INFORMATION", "COLLECTIONS", "PUBLIC RECORDS", "INQUIRIES", "CONSUMER STATEMENT"];
  
  let creditorName = "Unknown";
  for (const line of lines) {
    if (!skipHeaders.includes(line.toUpperCase())) {
      creditorName = line.replace(/[^a-zA-Z0-9\s&]/g, "").substring(0, 50).trim();
      break;
    }
  }
  if (!creditorName) creditorName = "Unknown";

  // Equifax Date formats are typically DD/MM/YYYY or YYYY/MM/DD
  const dateOpenedMatch = sectionText.match(/(?:Opened|Reported)[^\d]*(\d{2,4}[\/\-]\d{2}[\/\-]\d{2,4})/i);
  const opened = dateOpenedMatch ? parseEquifaxDate(dateOpenedMatch[1]) : null;

  // Identify Collections
  let isCollectionAccount = false;
  let collectionAgencyName = undefined;
  if (sectionText.toUpperCase().includes("COLLECTION") || (ratingMatch && ratingMatch[1].toUpperCase() === "R9")) {
      isCollectionAccount = true;
      collectionAgencyName = creditorName !== "Unknown" ? creditorName : undefined;
  }

  return {
    accountNumber,
    creditorName,
    accountType: "Unknown",
    balance,
    status,
    dates: {
      opened,
    },
    amounts: {
      pastDue,
    },
    remarkCodes: [],
    sourceText: sectionText,
    isCollectionAccount,
    collectionAgencyName
  };
}

/**
 * Resolves typical Equifax date strings into standard ISO dates.
 * Understands both YYYY-MM-DD and DD-MM-YYYY conventions commonly seen in CA PDFs.
 */
function parseEquifaxDate(dateStr: string): Date | null {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY -> YYYY-MM-DD
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`); 
    } else {
      // YY-MM-DD (assume 20xx for recent reports)
      const year = parseInt(parts[0], 10) > 50 ? `19${parts[0]}` : `20${parts[0]}`;
      return new Date(`${year}-${parts[1]}-${parts[2]}T00:00:00Z`);
    }
  }
  return null;
}