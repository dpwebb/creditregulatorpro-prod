/**
 * Strips HTML tags and formats the document into a readable raw text string.
 * This ensures clean text extraction while preserving visual separation.
 */
export function parseHtmlToRawText(html: string): string {
  if (!html) return "";
  const withNewlines = html
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<\/(td|th)>/gi, "  "); // Double space to naturally separate table cells on the same line

  const stripped = withNewlines.replace(/<[^>]+>/g, " ");
  // Collapse multiple spaces/newlines cleanly
  return stripped
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Extracts all rows from a given HTML table string, expanding colspans properly.
 */
export function parseTableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const trContent = trMatch[1];
    const cells: string[] = [];
    const tdRegex = /<(t[dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const attributes = tdMatch[2];
      const content = tdMatch[3];
      const colspanMatch = attributes.match(/colspan\s*=\s*["']?(\d+)["']?/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;
      const cellValue = parseHtmlToRawText(content).trim();
      for (let i = 0; i < colspan; i++) {
        cells.push(cellValue);
      }
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Extracts all tables within a given HTML snippet.
 */
export function parseAllTables(html: string): string[][][] {
  const tables: string[][][] = [];
  let startIndex = 0;
  while (true) {
    const tableStart = html.indexOf("<table", startIndex);
    if (tableStart === -1) break;
    const tableEnd = html.indexOf("</table>", tableStart);
    if (tableEnd === -1) break;

    const tableHtml = html.substring(tableStart, tableEnd + 8);
    tables.push(parseTableRows(tableHtml));
    startIndex = tableEnd + 8;
  }
  return tables;
}

export const ALL_SECTION_HEADERS = [
  /Credit Related Inquiries\s*:/i,
  /Non-?Credit Related Inquiries\s*:/i,
  /Account Review Inquiries\s*:/i,
  /Account\(s\)\s*:/i,
  /Insolvency\s*:/i,
  /Personal Information\s*:/i,
  /Personal Info\s*:/i,
  /Cross Reference\(s\)\s*:/i,
  /Address\(es\)\s*:/i,
  /Employment\(s\)\s*:/i,
  /Telephone Number\(s\)\s*:/i,
  /\*\*\* This completes the report \*\*\*/i,
  /Consumer's Name/i,
  /Signature\s*:/i
];

/**
 * Safely bounds a section across page breaks by finding the start regex 
 * and ending at the VERY next major section header, regardless of `<hr />` tags.
 */
export function getRegion(html: string, startRegex: RegExp): string | null {
  const match = html.match(startRegex);
  if (!match) return null;

  const matchIndex = match.index!;
  let startIndex = matchIndex;

  // If the header is inside an open table, we must capture from the table's start 
  // so `parseAllTables` doesn't miss the `<table` tag.
  const previousTableStart = html.lastIndexOf("<table", matchIndex);
  const previousTableEnd = html.lastIndexOf("</table>", matchIndex);
  if (previousTableStart > previousTableEnd) {
    startIndex = previousTableStart; 
  }

  const region = html.substring(startIndex);
  let minEnd = region.length;
  
  // Search for the end boundary AFTER the header to avoid matching itself
  const searchOffset = matchIndex - startIndex + match[0].length;
  const searchRegion = region.substring(searchOffset);

  for (const endRegex of ALL_SECTION_HEADERS) {
    const endMatch = searchRegion.match(endRegex);
    if (endMatch) {
      const trueIdx = searchOffset + endMatch.index!;
      if (trueIdx < minEnd) minEnd = trueIdx;
    }
  }
  return region.substring(0, minEnd);
}

/**
 * Maps arbitrary table rows into an array of strictly typed objects using a header map.
 * gracefully handles multiple concatenated tables (page spans) by ignoring repeated header rows.
 */
export function mapTableRows<T>(
  rows: string[][],
  headerMap: Record<string, string>
): T[] {
  if (!rows || rows.length < 2) return [];

  let headerRowIdx = -1;
  let mappedIndices: Record<string, number> = {};

  // Find the true header row
  for (let i = 0; i < rows.length; i++) {
    const headers = rows[i].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    let currentMappedIndices: Record<string, number> = {};
    let matchCount = 0;
    let usedIndices = new Set<number>();

    // Pass 1: exact matches
    for (const [key, field] of Object.entries(headerMap)) {
      const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = headers.findIndex((h, index) => h === target && !usedIndices.has(index));
      if (idx !== -1 && !(field in currentMappedIndices)) {
        currentMappedIndices[field] = idx;
        usedIndices.add(idx);
        matchCount++;
      }
    }

    // Pass 2: includes matches
    for (const [key, field] of Object.entries(headerMap)) {
      if (field in currentMappedIndices) continue;
      const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = headers.findIndex((h, index) => h.includes(target) && !usedIndices.has(index));
      if (idx !== -1 && !(field in currentMappedIndices)) {
        currentMappedIndices[field] = idx;
        usedIndices.add(idx);
        matchCount++;
      }
    }

    if (matchCount >= 2 || (matchCount === 1 && Object.keys(headerMap).length === 1)) {
      headerRowIdx = i;
      mappedIndices = currentMappedIndices;
      break;
    }
  }

  if (headerRowIdx === -1) return [];

  const result: T[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.every((c) => !c)) continue;

    const rowNorm = row.map((r) => r.toLowerCase().replace(/[^a-z0-9]/g, ""));
    let isRepeatedHeader = false;
    let matchCount = 0;
    let usedIndices = new Set<number>();
    let matchedKeys = new Set<string>();
    
    for (const key of Object.keys(headerMap)) {
      const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = rowNorm.findIndex((r, index) => r === target && !usedIndices.has(index));
      if (idx !== -1) {
        matchCount++;
        usedIndices.add(idx);
        matchedKeys.add(key);
      }
    }

    for (const key of Object.keys(headerMap)) {
      if (matchedKeys.has(key)) continue;
      const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const idx = rowNorm.findIndex((r, index) => r.includes(target) && !usedIndices.has(index));
      if (idx !== -1) {
        matchCount++;
        usedIndices.add(idx);
        matchedKeys.add(key);
      }
    }
    
    if (matchCount >= 2 || (matchCount === 1 && Object.keys(headerMap).length === 1)) {
      isRepeatedHeader = true;
    }

    if (isRepeatedHeader) continue;

    const obj: any = {};
    for (const [field, idx] of Object.entries(mappedIndices)) {
      obj[field] = row[idx] || "";
    }
    result.push(obj as T);
  }
  return result;
}

/**
 * Convenience wrapper to extract records spanning multiple pages.
 */
export function extractMappedRecords<T>(html: string, startRegex: RegExp, headerMap: Record<string, string>): T[] {
  const region = getRegion(html, startRegex);
  if (!region) return [];
  const tables = parseAllTables(region);
  const combinedRows = tables.flat(); // Merge all tables in the section
  
  const horizontalResults = mapTableRows<T>(combinedRows, headerMap);
  if (horizontalResults.length > 0) {
    return horizontalResults;
  }

  // Fallback: Vertical key-value layout
  const verticalResult: any = {};
  let matched = false;

  for (const row of combinedRows) {
    if (row.length >= 2) {
      const cellLabel = row[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const [key, field] of Object.entries(headerMap)) {
        const target = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cellLabel === target || cellLabel.includes(target)) {
          verticalResult[field] = row[1];
          matched = true;
          break;
        }
      }
    }
  }

  return matched ? [verticalResult as T] : [];
}

/**
 * Searches all tables in a segment for a specific key/value pair.
 * Handles both horizontal and vertical table structures.
 */
export function extractFieldFromTables(
  tables: string[][][],
  label: string
): string | null {
  const target = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const table of tables) {
    // 1. Paired key-value layout check (Label, Value, Label, Value)
    for (const row of table) {
      // Skip payment history detail header rows (exact cell matches, not substring)
      const normalizedCells = row.map(c => c.toLowerCase().trim());
      const isDetailHeader =
        normalizedCells.includes("balance") &&
        normalizedCells.includes("mop") &&
        (normalizedCells.includes("date") || normalizedCells.includes("payment"));
      if (isDetailHeader) {
        continue;
      }

      for (let i = 0; i < row.length - 1; i++) {
        const cellLabel = row[i].toLowerCase().replace(/[^a-z0-9]/g, "");
        const suffix = cellLabel.slice(target.length);
        const isValidSuffix = ["", "date", "amount", "due"].includes(suffix);
        
        if (cellLabel === target || (cellLabel.startsWith(target) && isValidSuffix)) {
          let nextCol = i + 1;
          while (nextCol < row.length && row[nextCol].toLowerCase().replace(/[^a-z0-9]/g, "") === cellLabel) {
            nextCol++;
          }
          if (nextCol < row.length) {
            if (nextCol + 1 < row.length && row[nextCol] === row[nextCol + 1]) {
              continue;
            }
            return row[nextCol];
          }
        }
      }
    }

    if (table.length >= 2) {
      // 2. Try horizontal header layout
      const headers = table[0].map((h) =>
        h.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      const isKeyValueRow = headers.some((h) =>
        ["reporteddate", "openeddate", "closeddate", "accounttype", "balance", "pastdue"].includes(h)
      );

      if (!isKeyValueRow) {
        const idx = headers.findIndex((h) => h === target || h.includes(target));
        if (idx !== -1 && table[1][idx] !== undefined) {
          return table[1][idx];
        }
      }

      // 3. Try vertical layout (label: value pairs in rows)
      for (const row of table) {
        if (row.length >= 2) {
          const rowLabel = row[0].toLowerCase().replace(/[^a-z0-9]/g, "");
          const suffix = rowLabel.slice(target.length);
          const isValidSuffix = ["", "date", "amount", "due"].includes(suffix);
          if (rowLabel === target || (rowLabel.startsWith(target) && isValidSuffix)) {
            let nextCol = 1;
            while (nextCol < row.length && row[nextCol].toLowerCase().replace(/[^a-z0-9]/g, "") === rowLabel) {
              nextCol++;
            }
            if (nextCol < row.length) {
              if (nextCol + 1 < row.length && row[nextCol] === row[nextCol + 1]) {
                continue;
              }
              return row[nextCol];
            }
          }
        }
      }
    }
  }
  return null;
}