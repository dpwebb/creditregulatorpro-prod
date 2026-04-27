export interface AnalyticsReportConfig {
  data: any;
  title?: string;
}

export async function generateAnalyticsReportPDF(config: AnalyticsReportConfig): Promise<string> {
  const response = await fetch("/_api/pdf/analytics-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error("Failed to generate analytics report PDF");
  }

  const result = await response.json();
  return result.pdf;
}