/**
 * Utility to export data to CSV format and trigger a browser download.
 * Handles proper escaping for Excel/Sheets compatibility (RFC 4180).
 */

export interface CSVColumn {
  /** The key in the data object to access */
  key: string;
  /** The label to display in the CSV header */
  label: string;
}

/**
 * Escapes a single field for CSV format.
 * - Wraps in quotes if it contains commas, quotes, or newlines.
 * - Escapes existing double quotes with another double quote.
 * - Handles null/undefined by returning empty string.
 */
function escapeCSVField(field: any): string {
  if (field === null || field === undefined) {
    return "";
  }

  const stringValue = String(field);

  // Check if the field needs to be quoted
  // It needs quotes if it contains: " , \n \r
  const needsQuotes = /[",\n\r]/.test(stringValue);

  if (needsQuotes) {
    // Escape double quotes by doubling them: " -> ""
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Exports an array of objects to a CSV file and triggers a download in the browser.
 *
 * @param data Array of data objects to export
 * @param filename The name of the file to download (without extension, or with .csv)
 * @param columns Optional configuration for column mapping and ordering. If omitted, uses keys from the first object.
 */
export function exportToCSV(
  data: Record<string, any>[],
  filename: string,
  columns?: CSVColumn[]
): void {
  if (!data || data.length === 0) {
    console.warn("exportToCSV: No data provided to export.");
    return;
  }

  // 1. Determine columns if not provided
  const cols: CSVColumn[] = columns
    ? columns
    : Object.keys(data[0]).map((key) => ({ key, label: key }));

  // 2. Generate Header Row
  const headerRow = cols.map((c) => escapeCSVField(c.label)).join(",");

  // 3. Generate Data Rows
  const dataRows = data.map((row) => {
    return cols
      .map((col) => {
        const val = row[col.key];
        return escapeCSVField(val);
      })
      .join(",");
  });

  // 4. Combine into CSV content
  const csvContent = [headerRow, ...dataRows].join("\r\n");

  // 5. Create Blob and trigger download
  // Adding BOM (Byte Order Mark) for better Excel compatibility with UTF-8
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  
  // Ensure filename ends with .csv
  const safeFilename = filename.toLowerCase().endsWith(".csv")
    ? filename
    : `${filename}.csv`;

  link.setAttribute("href", url);
  link.setAttribute("download", safeFilename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}