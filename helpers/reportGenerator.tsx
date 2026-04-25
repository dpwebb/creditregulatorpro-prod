export interface ReportColumn {
  /** The header text for the column */
  header: string;
  /** The key in the data object to map to this column */
  dataKey: string;
  /** Width of the column: '*' (fill), 'auto' (content), or number */
  width?: string | number;
}

export interface ReportConfig {
  /** Main title of the report */
  title: string;
  /** Optional subtitle or description */
  subtitle?: string;
  /** Key-value pairs to display as metadata at the top (e.g., Filters, Date Range) */
  metadata?: Record<string, string>;
  /** Column definitions for the data table */
  columns: ReportColumn[];
  /** Array of data objects */
  data: Record<string, any>[];
  /** Optional text to appear in the footer */
  footerText?: string;
  /** Page orientation */
  orientation?: "portrait" | "landscape";
}

/**
 * Generates a structured PDF report from the provided configuration.
 * Requests generation from the backend endpoint.
 *
 * @param config Configuration object for the report
 * @returns Promise resolving to the base64 string of the generated PDF
 */
export async function generateReportPDF(config: ReportConfig): Promise<string> {
  const response = await fetch("/_api/pdf/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error("Failed to generate report PDF");
  }

  const result = await response.json();
  return result.pdf;
}