/**
 * Month name mappings for English and French
 */
const MONTH_NAMES: Record<string, number> = {
  // English
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  // French (only non-duplicate keys)
  janv: 0,
  janvier: 0,
  févr: 1,
  fev: 1,
  fevr: 1,
  février: 1,
  fevrier: 1,
  mars: 2,
  avr: 3,
  avril: 3,
  mai: 4,
  juin: 5,
  juil: 6,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  déc: 11,
  décembre: 11,
  decembre: 11,
};

/**
 * Parses a date string in various Canadian credit report formats.
 * Supports:
 * - YYYY-MM-DD, YYYY/MM/DD
 * - DD/MM/YYYY, MM/DD/YYYY
 * - MM/YYYY, YYYY/MM (month-year only)
 * - "Jan 15 2024", "Jan 15, 2024"
 * - "JAN 2024" (month-year with no day)
 * - French month names (Janv., Févr., etc.)
 *
 * @param dateStr The date string to parse
 * @returns A Date object or null if parsing fails
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") {
    return null;
  }

  const trimmed = dateStr.trim();

  try {
    // Format: YYYY/MM/DD or YYYY-MM-DD or YYYY.MM.DD
    const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const parsed = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
      );
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Format: DD/MM/YYYY or MM/DD/YYYY (ambiguous, try both)
    const slashMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (slashMatch) {
      const [, first, second, year] = slashMatch;
      // Try DD/MM/YYYY first (more common in Canada)
      const ddmmParsed = new Date(
        parseInt(year),
        parseInt(second) - 1,
        parseInt(first),
      );
      if (!isNaN(ddmmParsed.getTime()) && parseInt(second) <= 12) {
        return ddmmParsed;
      }
      // Try MM/DD/YYYY
      const mmddParsed = new Date(
        parseInt(year),
        parseInt(first) - 1,
        parseInt(second),
      );
      if (!isNaN(mmddParsed.getTime())) {
        return mmddParsed;
      }
    }

    // Format: MM/YYYY or YYYY/MM (month-year only)
    const monthYearMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
    if (monthYearMatch) {
      const [, month, year] = monthYearMatch;
      const parsed = new Date(parseInt(year), parseInt(month) - 1, 1);
      if (!isNaN(parsed.getTime()) && parseInt(month) <= 12) {
        return parsed;
      }
    }

    // Format: YYYY/MM (year-month only)
    const yearMonthMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
    if (yearMonthMatch) {
      const [, year, month] = yearMonthMatch;
      const parsed = new Date(parseInt(year), parseInt(month) - 1, 1);
      if (!isNaN(parsed.getTime()) && parseInt(month) <= 12) {
        return parsed;
      }
    }

    // Format: "Jan 15 2024", "Jan 15, 2024", "January 15 2024"
    const monthDayYearMatch = trimmed.match(
      /^([a-zéû]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i,
    );
    if (monthDayYearMatch) {
      const [, monthStr, day, year] = monthDayYearMatch;
      const month = MONTH_NAMES[monthStr.toLowerCase().replace(/\./g, "")];
      if (month !== undefined) {
        const parsed = new Date(parseInt(year), month, parseInt(day));
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    // Format: "JAN 2024", "January 2024", "Janv. 2024" (month-year with no day)
    const monthYearTextMatch = trimmed.match(/^([a-zéû]+)\.?\s+(\d{4})$/i);
    if (monthYearTextMatch) {
      const [, monthStr, year] = monthYearTextMatch;
      const month = MONTH_NAMES[monthStr.toLowerCase().replace(/\./g, "")];
      if (month !== undefined) {
        const parsed = new Date(parseInt(year), month, 1);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    // Try parsing with built-in Date constructor as fallback
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      // Validate it's a reasonable date (between 1950 and 2100)
      const year = date.getFullYear();
      if (year >= 1950 && year <= 2100) {
        return date;
      }
    }

    return null;
  } catch (error) {
    console.warn(`[Date Parser] Failed to parse date: "${dateStr}"`, error);
    return null;
  }
}

/**
 * Extracts and parses dates from a text section.
 *
 * @param text The text to search for dates
 * @returns Object containing parsed dates for opened, reported, closed, and dofd
 */
export function extractDates(text: string): {
  opened?: Date | null;
  reported?: Date | null;
  closed?: Date | null;
  dofd?: Date | null;
} {
  const dates: {
    opened?: Date | null;
    reported?: Date | null;
    closed?: Date | null;
    dofd?: Date | null;
  } = {
    opened: null,
    reported: null,
    closed: null,
    dofd: null,
  };

  // Comprehensive date format pattern
  const datePattern =
    /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Janv|Févr|Fev|Mars|Avr|Mai|Juin|Juil|Août|Aout|Sept|Octobre|Novembre|Déc)[a-zéû]*\.?\s+\d{1,2},?\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Janv|Févr|Fev|Mars|Avr|Mai|Juin|Juil|Août|Aout|Sept|Octobre|Novembre|Déc)[a-zéû]*\.?\s+\d{4})/i;

  // Opened date patterns (English and French)
  const openedPatterns = [
    // TransUnion concatenated format: "Opened DateSep 03, 2011" (no separator)
    /Opened\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /(?:Date\s+)?Opened[\s:]+([^\n]+)/i,
    /Open(?:ed)?\s+Date[\s:]+([^\n]+)/i,
    /Date\s+Open(?:ed)?[\s:]+([^\n]+)/i,
    /\bOpened\s+([^\n]+)/i, // Bare "Opened 2024/11/19"
    /\bOuvert\s+([^\n]+)/i, // French "Ouvert"
  ];

  for (const pattern of openedPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dateMatch = match[1].match(datePattern);
      if (dateMatch) {
        dates.opened = parseDate(dateMatch[1]);
        if (dates.opened) break;
      }
    }
  }

  // Reported date patterns (English and French)
  const reportedPatterns = [
    // TransUnion concatenated format: "Reported DateOct 31, 2013" (no separator)
    /Reported\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /(?:Last\s+)?Report(?:ed)?[\s:]+([^\n]+)/i,
    /Date\s+Report(?:ed)?[\s:]+([^\n]+)/i,
    /Report(?:ing)?\s+Date[\s:]+([^\n]+)/i,
    /\bLast\s+Reported\s+([^\n]+)/i, // "Last Reported 2025/01/16"
    /\bDernière\s+mise\s+à\s+jour\s+([^\n]+)/i, // French "Dernière mise à jour"
  ];

  for (const pattern of reportedPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dateMatch = match[1].match(datePattern);
      if (dateMatch) {
        dates.reported = parseDate(dateMatch[1]);
        if (dates.reported) break;
      }
    }
  }

  // Closed date patterns (English and French)
  const closedPatterns = [
    // TransUnion concatenated format: "Closed DateJun 17, 2024" (no separator)
    /Closed\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /(?:Date\s+)?Closed[\s:]+([^\n]+)/i,
    /Close(?:d)?\s+Date[\s:]+([^\n]+)/i,
    /Date\s+Close(?:d)?[\s:]+([^\n]+)/i,
    /\bDate\s+Closed\s+([^\n]+)/i,
    /\bFermé\s+([^\n]+)/i, // French "Fermé"
  ];

  for (const pattern of closedPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dateMatch = match[1].match(datePattern);
      if (dateMatch) {
        dates.closed = parseDate(dateMatch[1]);
        if (dates.closed) break;
      }
    }
  }

  // DOFD (Date of First Delinquency) patterns
  const dofdPatterns = [
    // TransUnion concatenated format: "First Delinquency DateDec 16, 2023" (no separator)
    /First\s*Delinquency\s*Date([A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4})/i,
    /DOFD[\s:]+([^\n]+)/i,
    /Date\s+of\s+First\s+Delinquency[\s:]+([^\n]+)/i,
    /First\s+Delinquency[\s:]+([^\n]+)/i,
  ];

  for (const pattern of dofdPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dateMatch = match[1].match(datePattern);
      if (dateMatch) {
        dates.dofd = parseDate(dateMatch[1]);
        if (dates.dofd) break;
      }
    }
  }

  // Last Payment date patterns (for Equifax reports)
  const lastPaymentPatterns = [
    /\bLast\s+Payment\s+([^\n]+)/i,
    /\bPaiement\s+([^\n]+)/i, // French "Paiement"
  ];

  for (const pattern of lastPaymentPatterns) {
    const match = text.match(pattern);
    if (match) {
      const dateMatch = match[1].match(datePattern);
      if (dateMatch) {
        const lastPaymentDate = parseDate(dateMatch[1]);
        // Store as reported date if we don't have one yet
        if (lastPaymentDate && !dates.reported) {
          dates.reported = lastPaymentDate;
          break;
        }
      }
    }
  }

  return dates;
}