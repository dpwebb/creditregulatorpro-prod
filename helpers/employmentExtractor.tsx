export type ExtractedEmploymentInfo = {
  employerName: string | null;
  occupation: string | null;
  employmentStatus: string | null;
  salary: number | null;
  salaryFrequency: string | null;
  hireDate: Date | null;
  terminationDate: Date | null;
  verifiedDate: Date | null;
  employerAddress: string | null;
  employerCity: string | null;
  employerProvince: string | null;
  employerPostalCode: string | null;
  employerPhone: string | null;
  isCurrent: boolean | null;
  rawSectionText: string;
  confidence: number; // 0-100
};

import {
  extractTransUnionSection,
  findTransUnionDateString,
  parseTransUnionDate,
} from "./transunionTextParsing";

/**
 * Extracts employment information from credit report text.
 */
export function extractEmploymentInfo(text: string): ExtractedEmploymentInfo[] {
  const employments: ExtractedEmploymentInfo[] = [];

  const transUnionEmployments = extractTransUnionEmploymentInfo(text);
  if (transUnionEmployments.length > 0) {
    console.log(`[EmploymentExtractor] Found ${transUnionEmployments.length} TransUnion employment entries`);
    return transUnionEmployments;
  }
  
  // Strategy: Find the main Employment section, then split into individual entries
  
  const employmentHeaders = [
    "EMPLOYMENT INFORMATION",
    "EMPLOYMENT HISTORY",
    "EMPLOYER INFORMATION",
    "CURRENT EMPLOYMENT",
    "PREVIOUS EMPLOYMENT"
  ];

  const lines = text.split('\n');
  let inEmploymentSection = false;
  let sectionLines: string[] = [];
  
  // 1. Isolate the Employment Section
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isHeader = employmentHeaders.some(h => line.toUpperCase() === h || line.toUpperCase().startsWith(h + ":"));
    
    if (isHeader) {
      inEmploymentSection = true;
      // Don't include the main header in the content lines if possible, but keep it for context if needed
      continue; 
    } else if (inEmploymentSection) {
      // Check for end of section
      if (/^(TRADELINES|INQUIRIES|PUBLIC RECORDS|COLLECTIONS|CREDIT SCORE|CONSUMER INFO|PERSONAL INFO|ADDRESSES)/i.test(line)) {
        inEmploymentSection = false;
        break;
      }
      sectionLines.push(line);
    }
  }

  if (sectionLines.length === 0) {
    return [];
  }

  // 2. Split into individual employer blocks
  // Employers are often separated by blank lines or numbered lists
  // Or sometimes just listed line by line
  
  // Simple heuristic: Group lines that seem to belong together.
  // Often starts with Employer Name in caps or "Employer:"
  
  const employerBlocks: string[][] = [];
  let currentBlock: string[] = [];
  
  for (const line of sectionLines) {
    // Check if line looks like start of new employer
    // e.g. "1. ACME CORP" or "Employer: ACME CORP"
    const isNewEntry = /^\d+\.\s+[A-Z]/.test(line) || 
                       /^Employer:/.test(line) ||
                       (line === line.toUpperCase() && line.length > 4 && !line.includes(":")); // All caps line might be employer name

    if (isNewEntry && currentBlock.length > 0) {
      // Heuristic: if the previous block was very short (1 line) and didn't look complete, maybe merge?
      // For now, assume split is correct
      employerBlocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) employerBlocks.push(currentBlock);

  // 3. Process each block
  for (const block of employerBlocks) {
    processEmployerBlock(block, employments);
  }

  console.log(`[EmploymentExtractor] Found ${employments.length} employment entries`);
  return employments;
}

function extractTransUnionEmploymentInfo(text: string): ExtractedEmploymentInfo[] {
  const section = extractTransUnionSection(text, [/Employment\(s\)\s*:/i]);
  if (!section || /^not applicable$/i.test(section.trim())) return [];

  const rowPattern =
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})([\s\S]*?)(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|$)/gi;

  const rows: ExtractedEmploymentInfo[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const verifiedDate = parseTransUnionDate(match[1]);
    let remainder = (match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!remainder || /^(date|employer|occupation|not applicable)$/i.test(remainder)) continue;

    const startDateString = findTransUnionDateString(remainder);
    const hireDate = startDateString ? parseTransUnionDate(startDateString) : null;
    if (startDateString) {
      remainder = remainder.replace(startDateString, "").trim();
    }

    let employerName = remainder;
    let occupation: string | null = null;
    const occupationMatch = remainder.match(/^(.*?)(SELF|SELF EMPLOYED|EMPLOYED|RETIRED|STUDENT|UNEMPLOYED)$/i);
    if (occupationMatch) {
      employerName = occupationMatch[1].trim();
      occupation = occupationMatch[2].replace(/\s+/g, " ").trim();
    }

    if (!employerName || employerName.length < 2) continue;

    rows.push({
      employerName,
      occupation,
      employmentStatus: null,
      salary: null,
      salaryFrequency: null,
      hireDate,
      terminationDate: null,
      verifiedDate,
      employerAddress: null,
      employerCity: null,
      employerProvince: null,
      employerPostalCode: null,
      employerPhone: null,
      isCurrent: null,
      rawSectionText: `${match[1]} ${match[2]}`.trim(),
      confidence: 90,
    });
  }

  return rows;
}

function processEmployerBlock(lines: string[], results: ExtractedEmploymentInfo[]) {
  const blockText = lines.join('\n');
  
  // 1. Extract Employer Name
  let employerName: string | null = null;
  
  // Try explicit label
  const nameMatch = blockText.match(/Employer:?\s*([^\n]+)/i);
  if (nameMatch) {
    employerName = nameMatch[1].trim();
  } else {
    // Assume first line is employer name if it looks like a title
    const firstLine = lines[0].replace(/^\d+\.\s*/, "").trim();
    if (firstLine.length > 2) {
      employerName = firstLine;
    }
  }

  // 2. Extract Occupation/Position
  let occupation: string | null = null;
  const occupationMatch = blockText.match(/(?:Occupation|Position|Title):?\s*([^\n]+)/i);
  if (occupationMatch) {
    occupation = occupationMatch[1].trim();
  }

  // 3. Extract Dates
  let hireDate: Date | null = null;
  let terminationDate: Date | null = null;
  let verifiedDate: Date | null = null;

  const parseDate = (str: string): Date | null => {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const datePatterns = [
    { type: 'hire', regex: /(?:Hired|Employed|Start)(?:\s+Date)?:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i },
    { type: 'term', regex: /(?:Left|Terminated|End)(?:\s+Date)?:?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i },
    { type: 'verified', regex: /(?:Verified|Reported|Date Reported):?\s*(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}|[A-Za-z]{3}\s+\d{1,2},?\s+\d{4})/i }
  ];

  for (const pattern of datePatterns) {
    const match = blockText.match(pattern.regex);
    if (match) {
      const date = parseDate(match[1]);
      if (date) {
        if (pattern.type === 'hire') hireDate = date;
        else if (pattern.type === 'term') terminationDate = date;
        else if (pattern.type === 'verified') verifiedDate = date;
      }
    }
  }

  // 4. Extract Salary
  let salary: number | null = null;
  let salaryFrequency: string | null = null;
  
  const salaryMatch = blockText.match(/Salary:?\s*\$?([\d,]+)(?:\s*(\w+))?/i);
  if (salaryMatch) {
    const amount = parseFloat(salaryMatch[1].replace(/,/g, ""));
    if (!isNaN(amount)) {
      salary = amount;
      if (salaryMatch[2]) {
        salaryFrequency = salaryMatch[2]; // e.g. "Monthly", "Yearly"
      }
    }
  }

  // 5. Extract Status / Is Current
  let isCurrent: boolean | null = null;
  let employmentStatus: string | null = null;
  
  if (blockText.match(/\bCurrent\b/i)) {
    isCurrent = true;
    employmentStatus = "Current";
  } else if (blockText.match(/\b(Previous|Former|Past)\b/i)) {
    isCurrent = false;
    employmentStatus = "Previous";
  }
  
  // If termination date exists, likely not current
  if (terminationDate) {
    isCurrent = false;
    employmentStatus = "Terminated";
  }

  // 6. Extract Address Info (Basic extraction)
  let employerAddress: string | null = null;
  let employerCity: string | null = null;
  let employerProvince: string | null = null;
  let employerPostalCode: string | null = null;

  // Look for city/province/postal patterns
  // e.g. "Toronto, ON M5V 2T6"
  const addressMatch = blockText.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)/);
  if (addressMatch) {
    employerCity = addressMatch[1].trim();
    employerProvince = addressMatch[2].trim();
    employerPostalCode = addressMatch[3].trim();
    // Assume the line containing this match is the address line
    employerAddress = addressMatch[0];
  }

  // Only add if we found at least a name or occupation
  if (employerName || occupation) {
    results.push({
      employerName,
      occupation,
      employmentStatus,
      salary,
      salaryFrequency,
      hireDate,
      terminationDate,
      verifiedDate,
      employerAddress,
      employerCity,
      employerProvince,
      employerPostalCode,
      employerPhone: null, // Phone extraction is tricky without specific labels
      isCurrent,
      rawSectionText: blockText,
      confidence: employerName ? 80 : 50
    });
  }
}
