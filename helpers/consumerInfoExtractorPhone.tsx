/**
 * Helper to extract phone numbers from credit report text.
 * Focuses on Canadian/US phone formats commonly found in credit reports.
 */

export function extractPhone(
  text: string,
  lines: string[]
): { phone: string | null; confidence: number } {
  let phoneNumber: string | null = null;
  let confidence = 0;

  // Regex for matching phone numbers with various delimiters
  // Matches:
  // (123) 456-7890
  // 123-456-7890
  // 123.456.7890
  // 123 456 7890
  // +1 ...
  const phoneRegex =
    /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/i;

  // Strategy 1: Look for explicit labels in lines
  // This is usually the most accurate method
  const phoneLabels = [
    /^(?:PHONE|TELEPHONE|TEL|HOME\s+PHONE|CELL|MOBILE|CONTACT|PH)[\s.:#]+(.*)$/i,
    /^(?:PHONE|TELEPHONE|TEL|HOME\s+PHONE|CELL|MOBILE|CONTACT|PH)\s*$/i, // Label on its own line
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for label + value on same line
    const labelMatch = line.match(phoneLabels[0]);
    if (labelMatch && labelMatch[1]) {
      const potentialPhone = labelMatch[1].trim();
      const extracted = extractPhoneFromSegment(potentialPhone, phoneRegex);
      if (extracted) {
        phoneNumber = extracted;
        confidence = 80; // High confidence for labeled field
        break;
      }
    }

    // Check for label on one line, value on next
    if (phoneLabels[1].test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const extracted = extractPhoneFromSegment(nextLine, phoneRegex);
      if (extracted) {
        phoneNumber = extracted;
        confidence = 70; // Good confidence for multi-line label
        break;
      }
    }
  }

  // Strategy 2: If no labeled phone found, scan the whole text for patterns near keywords
  // This is less reliable but useful if formatting is messy
  if (!phoneNumber) {
    // Look for phone patterns that appear shortly after keywords in the raw text
    const keywordPattern =
      /(?:PHONE|TELEPHONE|TEL|HOME|CELL|MOBILE|CONTACT|PH)[\s\S]{0,50}?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i;
    const match = text.match(keywordPattern);

    if (match && match[1]) {
      const extracted = extractPhoneFromSegment(match[1], phoneRegex);
      if (extracted) {
        phoneNumber = extracted;
        confidence = 50; // Medium confidence
      }
    }
  }

  // Strategy 3: Last resort, find any valid phone number in the first few lines (header section)
  // Credit reports usually put consumer info at the top
  if (!phoneNumber) {
    const headerLines = lines.slice(0, 20); // Only look at top 20 lines
    for (const line of headerLines) {
      // Skip lines that look like dates or SINs or amounts
      if (
        line.includes("$") ||
        /^\d{3}-\d{3}-\d{3}$/.test(line) || // SIN pattern
        /^\d{4}-\d{2}-\d{2}$/.test(line) // Date pattern
      ) {
        continue;
      }

      const extracted = extractPhoneFromSegment(line, phoneRegex);
      if (extracted) {
        phoneNumber = extracted;
        confidence = 30; // Low confidence, could be any phone number
        break;
      }
    }
  }

  return { phone: phoneNumber, confidence };
}

/**
 * Helper to extract and normalize a phone number from a string segment
 */
function extractPhoneFromSegment(
  segment: string,
  regex: RegExp
): string | null {
  const match = segment.match(regex);
  if (match) {
    // match[0] is the full match, but might contain extra chars.
    // We want to extract digits and format.
    const digits = match[0].replace(/\D/g, "");

    // Check for valid length (10 digits for NA, or 11 if starting with 1)
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
  }
  return null;
}