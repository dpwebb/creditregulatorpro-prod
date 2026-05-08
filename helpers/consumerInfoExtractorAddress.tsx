import { ExtractedAddress } from "./consumerInfoExtractorTypes";
import { 
  POSTAL_CODE_PATTERN, 
  PROVINCE_PATTERN, 
  PROVINCE_MAP,
  BUREAU_ADDRESS_INDICATORS,
  BUREAU_ADDRESS_PATTERNS,
  CORPORATE_INDICATORS,
} from "./consumerInfoExtractorConstants";

type AddressExtractionResult = {
  address: Partial<ExtractedAddress>;
  confidence: number;
};

const PO_BOX_PATTERN =
  /\b(?:P\.?\s*O\.?\s*BOX|POST\s+OFFICE\s+BOX)\s*(?:#|NO\.?)?\s*[A-Z0-9][A-Z0-9-]*/i;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePoBoxText(value: string): string {
  return compactWhitespace(value)
    .replace(/^P\.?\s*O\.?\s*BOX\b/i, "PO BOX")
    .replace(/^POST\s+OFFICE\s+BOX\b/i, "PO BOX");
}

function splitPoBoxFromStreetLine(value: string): {
  street: string | null;
  poBox: string | null;
} {
  const compacted = compactWhitespace(value);
  const match = compacted.match(PO_BOX_PATTERN);
  if (!match || match.index === undefined) {
    return { street: compacted || null, poBox: null };
  }

  const street = compacted.slice(0, match.index).replace(/[,\s]+$/g, "").trim();
  return {
    street: street || null,
    poBox: normalizePoBoxText(match[0]),
  };
}

function normalizePoBoxAddressLines(address: Partial<ExtractedAddress>): void {
  if (address.addressLine1) {
    const split = splitPoBoxFromStreetLine(address.addressLine1);
    if (split.poBox) {
      address.addressLine1 = split.street;
      if (!address.addressLine2) {
        address.addressLine2 = split.poBox;
      } else if (!address.addressLine2.toUpperCase().includes(split.poBox.toUpperCase())) {
        address.addressLine2 = `${address.addressLine2} ${split.poBox}`;
      }
    }
  }

  if (address.addressLine2 && PO_BOX_PATTERN.test(address.addressLine2)) {
    address.addressLine2 = normalizePoBoxText(address.addressLine2);
  }
}

function isConsumerInfoSearchBoundary(line: string): boolean {
  return (
    /^Accounts?\s*-\s*(?:Revolving|Mortgage|Installment|Open)\b/i.test(line) ||
    /^Account\(s\)\s*:?$/i.test(line) ||
    /^\d+\.\s*(?:REVOLVING|INSTALLMENT|MORTGAGE|OPEN|COLLECTION)\b/i.test(line) ||
    /^(?:REVOLVING CREDIT|INSTALLMENT LOANS?|MORTGAGE|OPEN ACCOUNTS?|COLLECTIONS)$/i.test(line) ||
    /^(?:Creditor Name|Member Name|Account Number)\b/i.test(line) ||
    /^(?:Inquiries|Credit Related Inquiries|Public Records|Consumer Statement)\b/i.test(line)
  );
}

/**
 * Check if an address text contains bureau corporate address indicators
 */
function isBureauAddress(text: string): boolean {
  const upperText = text.toUpperCase();
  
  // Check for bureau address indicators
  for (const indicator of BUREAU_ADDRESS_INDICATORS) {
    if (upperText.includes(indicator)) {
      return true;
    }
  }
  
  // Check for known bureau address patterns
  for (const pattern of BUREAU_ADDRESS_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // Check for corporate indicators
  for (const pattern of CORPORATE_INDICATORS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find the line index where the consumer name appears
 */
function findConsumerNameIndex(lines: string[]): number {
  const nameLabels = [
    /^(?:FULL\s+LEGAL\s+NAME|CONSUMER\s+NAME\s*\(?\s*S\s*\)?|CONSUMER\s+NAME|SUBJECT\s+FULL\s+NAME|SUBJECT\s+NAME|FULL\s+NAME|NAME|PERSONAL\s+INFO)[\s:=]+(.+)$/i,
    /^(?:FULL\s+LEGAL\s+NAME|CONSUMER\s+NAME|SUBJECT\s+FULL\s+NAME|SUBJECT\s+NAME|FULL\s+NAME|NAME)[\s:=]*$/i,
  ];

  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const line = lines[i];
    if (isConsumerInfoSearchBoundary(line)) break;
    for (const pattern of nameLabels) {
      if (pattern.test(line)) {
        return i;
      }
    }
    
    // Check for standalone all-caps names
    const allCapsNamePattern = /^([A-ZÀ-Ÿ][A-ZÀ-Ÿ.''-]*(?:\s+[A-ZÀ-Ÿ][A-ZÀ-Ÿ.''-]*){1,3})$/;
    const match = line.match(allCapsNamePattern);
    if (match) {
      const candidateName = match[1].trim();
      const wordCount = candidateName.split(/\s+/).length;
      const isHeader = /^(ADDRESS|DATE|CONSUMER|SUBJECT|REPORT|FILE|PAGE|BUREAU|CREDIT|PERSONAL|INFO)/i.test(candidateName);
      
      if (wordCount >= 2 && wordCount <= 4 && !isHeader && candidateName.length >= 4) {
        return i;
      }
    }
  }
  
  return -1;
}

export function extractCurrentAddress(lines: string[]): AddressExtractionResult {
  const result: AddressExtractionResult = {
    address: {
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
    },
    confidence: 0,
  };

  const consumerNameIndex = findConsumerNameIndex(lines);
  console.log("[AddressExtractor] Consumer name found at line:", consumerNameIndex);

  const addressHeaderPattern = /^(?:CURRENT\s+ADDRESS|ADDRESS\s*\(?\s*S\s*\)?|MAILING\s+ADDRESS|STREET\s+ADDRESS|ADDRESS)[\s:=]*(.*)$/i;
  
  let addressBlockStartIndex = -1;
  let inlineAddressText = "";
  
  // Search for address header AFTER consumer name (if found)
  const searchStartIndex = consumerNameIndex >= 0 ? consumerNameIndex : 0;
  
  for (let i = searchStartIndex; i < lines.length; i++) {
    if (i > searchStartIndex && isConsumerInfoSearchBoundary(lines[i])) break;
    const headerMatch = lines[i].match(addressHeaderPattern);
    if (headerMatch) {
      inlineAddressText = headerMatch[1] ? headerMatch[1].trim() : "";
      addressBlockStartIndex = i + 1;
      
      // Check if this is a bureau address
      const combinedText = lines.slice(i, Math.min(i + 6, lines.length)).join(" ");
      if (isBureauAddress(combinedText)) {
        console.log("[AddressExtractor] Skipping bureau address at line:", i);
        inlineAddressText = "";
        addressBlockStartIndex = -1;
        continue;
      }
      
      console.log("[AddressExtractor] Found address header at line:", i);
      break;
    }
  }
  
  // Parse inline address
  if (inlineAddressText && inlineAddressText.length > 10) {
    if (!isBureauAddress(inlineAddressText)) {
      parseInlineAddress(inlineAddressText, result);
      if (result.address.postalCode) {
        addressBlockStartIndex = -1; // Skip multi-line parsing
      }
    } else {
      console.log("[AddressExtractor] Skipping bureau inline address");
      inlineAddressText = "";
    }
  }
  
  // Parse multi-line address block
  if (addressBlockStartIndex > 0 && addressBlockStartIndex < lines.length) {
    const addressLines = lines.slice(addressBlockStartIndex, addressBlockStartIndex + 5);
    const combinedText = addressLines.join(" ");
    
    if (!isBureauAddress(combinedText)) {
      parseAddressBlock(addressLines, result);
    } else {
      console.log("[AddressExtractor] Skipping bureau address block");
    }
  }
  
  // Fallback: Search for postal code AFTER consumer name
  if (!result.address.postalCode) {
    fallbackPostalCodeSearch(lines, result, consumerNameIndex);
  }

  normalizePoBoxAddressLines(result.address);

  return result;
}

export function extractPreviousAddresses(lines: string[]): { addresses: ExtractedAddress[]; confidence: number } {
  const addresses: ExtractedAddress[] = [];
  let totalConfidence = 0;

  const previousAddressPattern = /^(?:PREVIOUS\s+ADDRESS(?:ES)?|FORMER\s+ADDRESS(?:ES)?|PRIOR\s+ADDRESS(?:ES)?)[\s:=]*(.*)$/i;
  
  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(previousAddressPattern);
    if (headerMatch) {
      const inlineText = headerMatch[1] ? headerMatch[1].trim() : "";
      
      // Check for inline address
      if (inlineText && inlineText.length > 10 && POSTAL_CODE_PATTERN.test(inlineText)) {
        if (!isBureauAddress(inlineText)) {
          const result: AddressExtractionResult = {
            address: {
              addressLine1: null,
              addressLine2: null,
              city: null,
              province: null,
              postalCode: null,
            },
            confidence: 0,
          };
          parseInlineAddress(inlineText, result);
          if (result.address.postalCode) {
            normalizePoBoxAddressLines(result.address);
            addresses.push(result.address as ExtractedAddress);
            totalConfidence += result.confidence;
          }
        }
      } else {
        // Parse multi-line previous addresses
        const startIndex = i + 1;
        const endIndex = Math.min(startIndex + 20, lines.length);
        
        // Look for numbered addresses or address blocks
        for (let j = startIndex; j < endIndex; j++) {
          const line = lines[j];
          
          // Stop if we hit another major section
          if (/^(?:CURRENT|CREDIT|ACCOUNT|INQUIRY|SCORE|PUBLIC)/i.test(line)) {
            break;
          }
          
          // Check for numbered format like "1.", "2."
          const numberedMatch = line.match(/^(\d+)[\.\)]\s*(.*)$/);
          if (numberedMatch) {
            const addressBlock = lines.slice(j, Math.min(j + 5, endIndex));
            const combinedText = addressBlock.join(" ");
            
            if (!isBureauAddress(combinedText)) {
              const result: AddressExtractionResult = {
                address: {
                  addressLine1: null,
                  addressLine2: null,
                  city: null,
                  province: null,
                  postalCode: null,
                },
                confidence: 0,
              };
              parseAddressBlock(addressBlock, result);
              if (result.address.postalCode) {
                normalizePoBoxAddressLines(result.address);
                addresses.push(result.address as ExtractedAddress);
                totalConfidence += result.confidence;
              }
            }
            j += 4; // Skip ahead
          } else if (POSTAL_CODE_PATTERN.test(line)) {
            // Found a postal code, extract address block
            const addressBlock = lines.slice(Math.max(startIndex, j - 2), j + 1);
            const combinedText = addressBlock.join(" ");
            
            if (!isBureauAddress(combinedText)) {
              const result: AddressExtractionResult = {
                address: {
                  addressLine1: null,
                  addressLine2: null,
                  city: null,
                  province: null,
                  postalCode: null,
                },
                confidence: 0,
              };
              parseAddressBlock(addressBlock, result);
              if (result.address.postalCode) {
                normalizePoBoxAddressLines(result.address);
                addresses.push(result.address as ExtractedAddress);
                totalConfidence += result.confidence;
              }
            }
          }
        }
        break;
      }
    }
  }

  return { addresses, confidence: Math.min(totalConfidence, 50) };
}

function parseInlineAddress(text: string, result: AddressExtractionResult): void {
  const postalMatch = text.match(POSTAL_CODE_PATTERN);
  
  if (postalMatch) {
    result.address.postalCode = formatPostalCode(postalMatch[1]);
    result.confidence += 20;
    
    const provinceMatch = text.match(PROVINCE_PATTERN);
    if (provinceMatch) {
      result.address.province = normalizeProvince(provinceMatch[1]);
      result.confidence += 15;
    }
    
    const parts = text.split(",").map(p => p.trim()).filter(p => p.length > 0);
    
    if (parts.length >= 2) {
      const firstPart = parts[0];
      if (/^\d+/.test(firstPart)) {
        result.address.addressLine1 = firstPart;
        result.confidence += 15;
      }
      
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const hasPostal = POSTAL_CODE_PATTERN.test(part);
        const hasProvince = PROVINCE_PATTERN.test(part);
        
        if (!hasPostal && !hasProvince && /^[A-Za-zÀ-ÿ\s-]+$/.test(part) && part.length > 2) {
          result.address.city = part;
          result.confidence += 15;
          break;
        }
      }
      
      if (!result.address.city && parts.length >= 3) {
        for (let i = parts.length - 1; i >= 1; i--) {
          const part = parts[i];
          let cleaned = part
            .replace(POSTAL_CODE_PATTERN, "")
            .replace(PROVINCE_PATTERN, "")
            .trim();
          
          if (cleaned.length > 2 && /^[A-Za-zÀ-ÿ\s-]+$/.test(cleaned)) {
            result.address.city = cleaned;
            result.confidence += 15;
            break;
          }
        }
      }
    } else {
      parseSpaceDelimitedInlineAddress(text, result);
    }
  }
}

function parseSpaceDelimitedInlineAddress(text: string, result: AddressExtractionResult): void {
  if (!result.address.province) return;

  const beforeProvince = text
    .replace(POSTAL_CODE_PATTERN, "")
    .replace(PROVINCE_PATTERN, "")
    .replace(/[:=,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!beforeProvince || !/^\d+\b/.test(beforeProvince)) return;

  const streetCityMatch = beforeProvince.match(
    /^(.+\b(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|LN|LANE|CT|COURT|CRES|CRESCENT|WAY|HWY|HIGHWAY|PKWY|PARKWAY|PL|PLACE|TERR|TERRACE|TRAIL)\b(?:\s+(?:E|W|N|S|NE|NW|SE|SW))?)\s+([A-Za-z][A-Za-z\s.'-]{2,40})$/i,
  );

  if (!streetCityMatch) return;

  const addressLine1 = streetCityMatch[1].replace(/\s+/g, " ").trim();
  const city = streetCityMatch[2].replace(/\s+/g, " ").trim();

  if (!result.address.addressLine1 && addressLine1.length >= 4) {
    result.address.addressLine1 = addressLine1;
    result.confidence += 15;
  }

  if (
    !result.address.city &&
    city.length >= 3 &&
    city.length <= 40 &&
    /^[A-Za-z\s.'-]+$/.test(city)
  ) {
    result.address.city = city;
    result.confidence += 15;
  }
}

function parseCollapsedTransUnionAddressRow(line: string, result: AddressExtractionResult): boolean {
  if (/AddressCityProvPostal/i.test(line)) return false;

  const provincePostalMatch = line.match(
    /(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)([A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d)(?=(?:Home|Mail|Current|Previous|Former|Work|Own|Rent|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|$))/i,
  );
  if (!provincePostalMatch || provincePostalMatch.index === undefined) return false;

  const beforeProvince = line.slice(0, provincePostalMatch.index).replace(/\s+/g, " ").trim();
  const streetCityMatch = beforeProvince.match(
    /^(.+\b(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|BLVD|BOULEVARD|LN|LANE|CT|COURT|CRES|CRESCENT|WAY|HWY|HIGHWAY|PKWY|PARKWAY|PL|PLACE|TERR|TERRACE|TRAIL))\s*(?:(NE|NW|SE|SW|E|W|N|S))?([A-ZÀ-Ÿ][A-ZÀ-Ÿ.'-]{2,40})$/i,
  );
  if (!streetCityMatch) return false;

  const streetBase = compactWhitespace(streetCityMatch[1]);
  const direction = streetCityMatch[2] ? streetCityMatch[2].toUpperCase() : "";
  const city = compactWhitespace(streetCityMatch[3]);

  if (!result.address.addressLine1) {
    result.address.addressLine1 = direction ? `${streetBase} ${direction}` : streetBase;
    result.confidence += 15;
  }
  if (!result.address.city) {
    result.address.city = city;
    result.confidence += 15;
  }
  if (!result.address.province) {
    result.address.province = normalizeProvince(provincePostalMatch[1]);
    result.confidence += 15;
  }
  if (!result.address.postalCode) {
    result.address.postalCode = formatPostalCode(provincePostalMatch[2]);
    result.confidence += 20;
  }

  return Boolean(result.address.addressLine1 && result.address.city && result.address.province && result.address.postalCode);
}

/**
 * Extract city and province from a line that contains both
 * Handles formats like "STEWIACKE NS", "STEWIACKE, NS", etc.
 */
function extractCityAndProvince(line: string): { city: string | null; province: string | null } {
  const result = { city: null as string | null, province: null as string | null };
  
  // Try to find province first
  const provinceMatch = line.match(PROVINCE_PATTERN);
  if (!provinceMatch) {
    return result;
  }
  
  result.province = normalizeProvince(provinceMatch[1]);
  
  // Extract city as the text before the province
  const provinceIndex = provinceMatch.index!;
  let cityCandidate = line.substring(0, provinceIndex).trim();
  
  // Remove trailing comma or other punctuation
  cityCandidate = cityCandidate.replace(/[,\s]+$/, "").trim();
  
  // Validate city
  if (
    cityCandidate.length >= 3 &&
    cityCandidate.length <= 40 &&
    /^[A-Za-zÀ-ÿ\s-]+$/.test(cityCandidate) &&
    !/\d/.test(cityCandidate)
  ) {
    result.city = cityCandidate;
  }
  
  return result;
}

function parseAddressBlock(addressLines: string[], result: AddressExtractionResult): void {
  for (const line of addressLines) {
    if (parseCollapsedTransUnionAddressRow(line, result)) {
      return;
    }
  }

  let postalCodeLineIndex = -1;
  
  // Extract postal code
  for (let i = 0; i < addressLines.length; i++) {
    if (POSTAL_CODE_PATTERN.test(addressLines[i])) {
      postalCodeLineIndex = i;
      const postalMatch = addressLines[i].match(POSTAL_CODE_PATTERN);
      if (postalMatch) {
        result.address.postalCode = formatPostalCode(postalMatch[1]);
        result.confidence += 20;
      }
      break;
    }
  }
  
  // Extract province and city
  if (postalCodeLineIndex >= 0) {
    const postalLine = addressLines[postalCodeLineIndex];
    
    // Check if province is on the same line as postal code
    const provinceMatch = postalLine.match(PROVINCE_PATTERN);
    if (provinceMatch) {
      result.address.province = normalizeProvince(provinceMatch[1]);
      result.confidence += 15;
    }
    
    // If province not found on postal code line, check previous line
    // This handles the common format where city and province are on a separate line
    if (!result.address.province && postalCodeLineIndex > 0) {
      const prevLine = addressLines[postalCodeLineIndex - 1];
      const cityProvince = extractCityAndProvince(prevLine);
      
      if (cityProvince.province) {
        result.address.province = cityProvince.province;
        result.confidence += 15;
      }
      
      if (cityProvince.city) {
        result.address.city = cityProvince.city;
        result.confidence += 15;
      }
    }
  }
  
  // Extract city (if not already extracted from previous line with province)
  if (postalCodeLineIndex >= 0 && !result.address.city) {
    const postalLine = addressLines[postalCodeLineIndex];
    
    if (postalLine.includes(",")) {
      const commaParts = postalLine.split(",").map(p => p.trim());
      
      if (commaParts.length >= 2) {
        const cityCandidate = commaParts[0].trim();
        
        if (
          cityCandidate.length >= 3 &&
          cityCandidate.length <= 40 &&
          /^[A-Za-zÀ-ÿ\s-]+$/.test(cityCandidate) &&
          !/\d/.test(cityCandidate)
        ) {
          result.address.city = cityCandidate;
          result.confidence += 15;
        }
      }
    } else {
      let cityCandidate = postalLine
        .replace(POSTAL_CODE_PATTERN, "")
        .replace(PROVINCE_PATTERN, "")
        .replace(/[:=]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      
      if (cityCandidate.length > 2 && /^[A-Za-zÀ-ÿ\s-]+$/.test(cityCandidate)) {
        result.address.city = cityCandidate;
        result.confidence += 15;
      }
    }
    
    // Try to extract city from previous lines if still not found
    if (!result.address.city && postalCodeLineIndex > 0) {
      for (let i = postalCodeLineIndex - 1; i >= Math.max(0, postalCodeLineIndex - 2); i--) {
        const prevLine = addressLines[i];
        
        // Skip lines that look like street addresses
        if (/^\d+/.test(prevLine)) {
          continue;
        }
        
        // Try to extract city and province together first
        const cityProvince = extractCityAndProvince(prevLine);
        if (cityProvince.city) {
          result.address.city = cityProvince.city;
          result.confidence += 15;
          if (cityProvince.province && !result.address.province) {
            result.address.province = cityProvince.province;
            result.confidence += 15;
          }
          break;
        }
        
        // Fallback: try to extract city only
        let cleaned = prevLine
          .replace(PROVINCE_PATTERN, "")
          .replace(/[:=]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        
        if (
          cleaned.length >= 3 &&
          cleaned.length <= 40 &&
          /^[A-Za-zÀ-ÿ\s-]+$/.test(cleaned) &&
          !/\d/.test(cleaned)
        ) {
          result.address.city = cleaned;
          result.confidence += 15;
          break;
        }
      }
    }
  }
  
  // Extract street address
  for (let i = 0; i < addressLines.length && i < postalCodeLineIndex; i++) {
    const line = addressLines[i];
    if (/^\d+/.test(line) && line.length > 3) {
      result.address.addressLine1 = line;
      result.confidence += 15;
      
      if (i + 1 < addressLines.length && i + 1 < postalCodeLineIndex) {
        const nextLine = addressLines[i + 1];
        if (!/^\d+/.test(nextLine) && nextLine.length > 2 && nextLine.length < 40) {
          if (/^(APT|UNIT|SUITE|#|APP)/i.test(nextLine)) {
            result.address.addressLine2 = nextLine;
            result.confidence += 5;
          }
        }
      }
      break;
    }
  }
}

function fallbackPostalCodeSearch(lines: string[], result: AddressExtractionResult, consumerNameIndex: number): void {
  // Search starting from consumer name position (if found), otherwise from beginning
  const startIndex = consumerNameIndex >= 0 ? consumerNameIndex : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (i > startIndex && isConsumerInfoSearchBoundary(line)) break;
    const postalMatch = line.match(POSTAL_CODE_PATTERN);
    
    if (postalMatch) {
      // Check if this is a bureau address
      const contextLines = lines.slice(Math.max(0, i - 2), Math.min(i + 3, lines.length));
      const contextText = contextLines.join(" ");
      
      if (isBureauAddress(contextText)) {
        console.log("[AddressExtractor] Skipping bureau address in fallback at line:", i);
        continue;
      }
      
      result.address.postalCode = formatPostalCode(postalMatch[1]);
      result.confidence += 15;
      
      // Check if province is on the same line as postal code
      const provinceMatch = line.match(PROVINCE_PATTERN);
      if (provinceMatch && !result.address.province) {
        result.address.province = normalizeProvince(provinceMatch[1]);
        result.confidence += 10;
      }
      
      // Try to extract city from the same line as postal code
      if (!result.address.city) {
        let cityCandidate = line
          .replace(POSTAL_CODE_PATTERN, "")
          .replace(PROVINCE_PATTERN, "")
          .replace(/[:=,]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        
        if (cityCandidate.length > 2 && /^[A-Za-zÀ-ÿ\s-]+$/.test(cityCandidate)) {
          result.address.city = cityCandidate;
          result.confidence += 10;
        }
      }
      
      // If city or province not found on postal code line, check the previous line
      // This handles the common format: "CITY PROVINCE" on one line, "POSTALCODE" on next line
      if ((!result.address.city || !result.address.province) && i > 0) {
        const prevLine = lines[i - 1];
        
        // Skip if previous line looks like a street address
        if (!/^\d+/.test(prevLine)) {
          const cityProvince = extractCityAndProvince(prevLine);
          
          if (cityProvince.province && !result.address.province) {
            result.address.province = cityProvince.province;
            result.confidence += 10;
          }
          
          if (cityProvince.city && !result.address.city) {
            result.address.city = cityProvince.city;
            result.confidence += 10;
          }
        }
      }
      
      if (!result.address.addressLine1 && i > 0) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prevLine = lines[j];
          if (/^\d+/.test(prevLine) && prevLine.length > 3) {
            result.address.addressLine1 = prevLine;
            result.confidence += 10;
            break;
          }
        }
      }
      
      console.log("[AddressExtractor] Found valid consumer address in fallback at line:", i);
      break;
    }
  }
}

function formatPostalCode(postalCode: string): string {
  const cleaned = postalCode.replace(/[-\s]/g, "").toUpperCase();
  if (cleaned.length === 6) {
    return cleaned.slice(0, 3) + " " + cleaned.slice(3);
  }
  return cleaned;
}

function normalizeProvince(province: string): string {
  const normalized = province.toUpperCase().replace(/\s+/g, " ");
  return PROVINCE_MAP[normalized] || normalized;
}
