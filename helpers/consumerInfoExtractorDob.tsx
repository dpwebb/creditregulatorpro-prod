import { parse, isValid } from "./dateUtils";
import { extractTransUnionSection, findTransUnionDateString } from "./transunionTextParsing";

export function extractDateOfBirth(text: string, lines: string[]): { dob: Date | null; confidence: number } {
  let dateOfBirth: Date | null = null;
  let confidence = 0;

  // TransUnion Consumer Disclosure text often collapses the personal-info
  // table into a run like "Birth Date ... Jan 30, 1961" without separators.
  const transUnionDobContext = text.match(/Birth\s*Date[\s\S]{0,180}/i);
  if (transUnionDobContext) {
    const dobString = findTransUnionDateString(transUnionDobContext[0]);
    if (dobString) {
      const parsedDate = parseDate(dobString);
      if (parsedDate) {
        dateOfBirth = parsedDate;
        confidence += 30;
      }
    }
  }

  if (!dateOfBirth) {
    const transUnionPersonalInfo = extractTransUnionSection(text, [
      /Personal Information\s*:/i,
      /Personal Info\s*:/i,
    ]);
    const dobString = transUnionPersonalInfo ? findTransUnionDateString(transUnionPersonalInfo) : null;
    if (dobString) {
      const parsedDate = parseDate(dobString);
      if (parsedDate) {
        dateOfBirth = parsedDate;
        confidence += 25;
      }
    }
  }

  // Additional patterns for DOB extraction with various formats
  const dobPatterns = [
    // Pattern: "DOB: Jun 14, 1983" or "Date of Birth: 1983-06-14"
    /(?:DOB|Date\s+of\s+Birth|Birth\s+Date|Date\s+de\s+naissance|D\.O\.B\.|Birth\s+Day|BIRTH\s*DATE)[\s:=]+([A-Za-z0-9,\s\/-]+?)(?:\s*(?:\n|$|[A-Z]{2,}|\s{2,}))/i,
    // Pattern with explicit date format after colon or equals
    /(?:DOB|Date\s+of\s+Birth|Birth)[\s]*[:=][\s]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
    /(?:DOB|Date\s+of\s+Birth|Birth)[\s]*[:=][\s]*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i,
    // Pattern: "Birth Date Jun 14 1983"
    /(?:DOB|Date\s+of\s+Birth|Birth\s+Date)[\s:=]+([A-Za-z]{3,9}\s+\d{1,2}[\s,]+\d{4})/i,
  ];

  if (!dateOfBirth) {
    for (const pattern of dobPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        console.log(`[DOB Extractor] Pattern matched: "${match[1].trim()}"`);
        const parsedDate = parseDate(match[1].trim());
        if (parsedDate) {
          console.log(`[DOB Extractor] Successfully parsed DOB: ${parsedDate.toISOString()}`);
          dateOfBirth = parsedDate;
          confidence += 20;
          break;
        }
      }
    }
  }

  // Multi-line DOB extraction
  if (!dateOfBirth) {
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];
      
      const dobLabelPattern = /^(?:DOB|Date\s+of\s+Birth|Birth\s+Date|Date\s+de\s+naissance|D\.O\.B\.|Birth\s+Day)[\s:=]*$/i;
      
      if (dobLabelPattern.test(line) && nextLine && nextLine.trim().length > 0) {
        const parsedDate = parseDate(nextLine.trim());
        if (parsedDate) {
          dateOfBirth = parsedDate;
          confidence += 20;
          break;
        }
      }
    }
  }

  return { dob: dateOfBirth, confidence };
}

function parseDate(dobStr: string): Date | null {
  const formats = [
    "yyyy-MM-dd",
    "MM/dd/yyyy",
    "dd/MM/yyyy",
    "MMMM d, yyyy",
    "d MMMM yyyy",
    "yyyy/MM/dd",
    "dd-MMM-yyyy",
    "MMM dd yyyy",
  ];
  
  const standardParse = new Date(dobStr);
  if (isValid(standardParse) && standardParse.getFullYear() > 1900 && standardParse.getFullYear() < new Date().getFullYear()) {
    return standardParse;
  }
  
  for (const fmt of formats) {
    const d = parse(dobStr, fmt, new Date());
    if (isValid(d) && d.getFullYear() > 1900 && d.getFullYear() < new Date().getFullYear()) {
      return d;
    }
  }

  return null;
}
