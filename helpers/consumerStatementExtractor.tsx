import { parse } from "./dateUtils";
import { extractTransUnionSection } from "./transunionTextParsing";

export type ConsumerStatementType = 
  | "active_duty_alert" 
  | "dispute" 
  | "fraud_alert" 
  | "general_statement" 
  | "identity_theft" 
  | "security_freeze";

export type ExtractedConsumerStatement = {
  statementType: ConsumerStatementType;
  statementText: string;
  effectiveDate: Date | null;
  expirationDate: Date | null;
  addedDate: Date | null;
  rawSectionText: string;
  confidence: number; // 0-100
};

/**
 * Extracts consumer statements, fraud alerts, and disputes from credit report text.
 */
export function extractConsumerStatements(text: string): ExtractedConsumerStatement[] {
  const statements: ExtractedConsumerStatement[] = [];

  const transUnionStatementSection = extractTransUnionSection(text, [
    /Consumer Statement\(s\)\s*:/i,
    /Consumer Statement(?:s)?\s*:/i,
    /Consumer Message(?:s)?\s*:/i,
    /Special Message(?:s)?\s*:/i,
  ]);

  if (transUnionStatementSection) {
    const section = transUnionStatementSection.trim();
    if (section && !/^not applicable$/i.test(section)) {
      processStatementBlock(["Consumer Statement(s):", section], statements);
    }
    console.log(`[ConsumerStatementExtractor] Found ${statements.length} TransUnion statement(s)`);
    return statements;
  }
  
  // Strategy: Find sections that look like statement blocks
  // We look for headers like "Consumer Statement", "Fraud Alert", etc.
  
  const statementHeaders = [
    "CONSUMER STATEMENT",
    "FRAUD ALERT",
    "SECURITY ALERT",
    "ACTIVE DUTY ALERT",
    "ID THEFT",
    "IDENTITY THEFT",
    "SECURITY FREEZE"
  ];

  const lines = text.split('\n');
  let currentBlock: string[] = [];
  let inStatementBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for start of a statement section
    const isHeader = statementHeaders.some(h => line.toUpperCase().includes(h));
    
    if (isHeader) {
      if (inStatementBlock && currentBlock.length > 0) {
        processStatementBlock(currentBlock, statements);
      }
      inStatementBlock = true;
      currentBlock = [line];
    } else if (inStatementBlock) {
      // Heuristic to end block: if we hit another major section header
      if (/^(TRADELINES|INQUIRIES|PUBLIC RECORDS|COLLECTIONS|CREDIT SCORE|EMPLOYMENT|PERSONAL INFO)/i.test(line)) {
        processStatementBlock(currentBlock, statements);
        inStatementBlock = false;
        currentBlock = [];
      } else {
        currentBlock.push(line);
      }
    }
  }
  
  // Process final block
  if (inStatementBlock && currentBlock.length > 0) {
    processStatementBlock(currentBlock, statements);
  }

  console.log(`[ConsumerStatementExtractor] Found ${statements.length} statements`);
  return statements;
}

function processStatementBlock(lines: string[], results: ExtractedConsumerStatement[]) {
  const blockText = lines.join('\n');
  const headerLine = lines[0].toUpperCase();

  if (isInstructionalOrBoilerplateBlock(blockText, headerLine)) {
    return;
  }
  
  // 1. Determine Statement Type
  let statementType: ConsumerStatementType = "general_statement";
  
  if (headerLine.includes("FRAUD") || blockText.match(/fraud\s+alert/i)) {
    statementType = "fraud_alert";
  } else if (headerLine.includes("ACTIVE DUTY") || blockText.match(/active\s+duty/i)) {
    statementType = "active_duty_alert";
  } else if (headerLine.includes("DISPUTE") || blockText.match(/dispute/i)) {
    statementType = "dispute";
  } else if (headerLine.includes("IDENTITY THEFT") || headerLine.includes("ID THEFT") || blockText.match(/identity\s+theft/i)) {
    statementType = "identity_theft";
  } else if (headerLine.includes("FREEZE") || blockText.match(/security\s+freeze/i)) {
    statementType = "security_freeze";
  }

  // 2. Extract Dates
  let effectiveDate: Date | null = null;
  let expirationDate: Date | null = null;
  let addedDate: Date | null = null;

  // Helper to parse date strings
  const parseDate = (str: string): Date | null => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  // Look for specific date labels
  const datePatterns = [
    { type: 'effective', regex: /(?:Effective|Start)\s*Date:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i },
    { type: 'expiration', regex: /(?:Expiration|End|Expires)\s*Date:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i },
    { type: 'added', regex: /(?:Added|Reported|Date):?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i }
  ];

  for (const pattern of datePatterns) {
    const match = blockText.match(pattern.regex);
    if (match) {
      const date = parseDate(match[1]);
      if (date) {
        if (pattern.type === 'effective') effectiveDate = date;
        else if (pattern.type === 'expiration') expirationDate = date;
        else if (pattern.type === 'added') addedDate = date;
      }
    }
  }

  // 3. Extract Statement Text
  // Usually everything after the header and date lines
  let statementText = blockText;
  
  // Remove header line
  const textLines = lines.slice(1);
  
  // Filter out date lines and empty lines to get the core message
  const contentLines = textLines.filter(line => {
    const isDateLine = /(?:Effective|Start|Expiration|End|Expires|Added|Reported|Date)[\s:]+\d+/i.test(line);
    return !isDateLine && line.trim().length > 0;
  });
  
  if (contentLines.length > 0) {
    statementText = contentLines.join(' ').trim();
  } else {
    // Fallback if we filtered everything out (unlikely)
    statementText = textLines.join(' ').trim();
  }

  // Clean up common prefixes in the text
  statementText = statementText.replace(/^(Statement|Text|Comments?)[\s:]+/i, "");

  results.push({
    statementType,
    statementText,
    effectiveDate,
    expirationDate,
    addedDate,
    rawSectionText: blockText,
    confidence: 85 // Base confidence
  });
}

function isInstructionalOrBoilerplateBlock(blockText: string, headerLine: string): boolean {
  const normalized = blockText.replace(/\s+/g, " ").trim();
  if (!normalized || /^Consumer Statement\(s\):?\s*not applicable$/i.test(normalized)) {
    return true;
  }

  const hasExplicitStatementHeader =
    /CONSUMER STATEMENT|FRAUD ALERT|SECURITY ALERT|ACTIVE DUTY ALERT|IDENTITY THEFT|SECURITY FREEZE/i.test(headerLine);

  const instructionalPatterns = [
    /INVESTIGATION REQUEST FORM/i,
    /Need to dispute/i,
    /If you believe.*information.*inaccurate/i,
    /mail this form/i,
    /send your dispute/i,
    /attach.*documents/i,
    /instructions/i,
  ];

  return !hasExplicitStatementHeader && instructionalPatterns.some((pattern) => pattern.test(normalized));
}
