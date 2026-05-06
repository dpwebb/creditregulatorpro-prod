import { useState } from "react";
import { Download, FileJson, Play, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { Spinner } from "./Spinner";
import { Switch } from "./Switch";
import { useRunParserLabStage } from "../helpers/parserLabQueries";
import { PARSER_LAB_STAGE_VERSION } from "../helpers/parserLabStageVersion";
import { formatDateOnlyEnCa } from "../helpers/dateOnly";
import { AI_FALLBACK_AVAILABLE } from "../helpers/aiFallbackAvailability";
import styles from "./ParserLabStageTab.module.css";

type ParserLabResult = Awaited<ReturnType<ReturnType<typeof useRunParserLabStage>["mutateAsync"]>>;
type ResultTab = "results" | "review" | "tradelines" | "raw" | "audit";

export type StageLabTestCasePayload = {
  name: string;
  description?: string;
  pdfBase64: string;
  expectedConsumerInfo?: unknown;
  expectedTradelines?: unknown;
  rawExtractedText?: string | null;
  bureau?: string | null;
  parserMode?: string | null;
  allowAiFallback?: boolean | null;
  stageVersion?: string | null;
  extractionSource?: string | null;
  parserContext?: unknown;
};

interface ParserLabStageTabProps {
  onSaveAsTestCase?: (
    payload: StageLabTestCasePayload,
  ) => Promise<{ testCase?: { id: number } } | void>;
  isSavingTestCase?: boolean;
}

const RESULT_TABS: Array<{ value: ResultTab; label: string }> = [
  { value: "results", label: "Stage Lab Results" },
  { value: "review", label: "Review Queue" },
  { value: "tradelines", label: "Parsed Tradelines" },
  { value: "raw", label: "Raw Text Preview" },
  { value: "audit", label: "Complete Parsed Output" },
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.split(",")[1] || value);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function qualityVariant(score: number): "success" | "warning" | "error" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "error";
}

function severityVariant(severity: string): "success" | "warning" | "error" | "info" {
  if (severity === "ERROR") return "error";
  if (severity === "WARNING") return "warning";
  if (severity === "INFO") return "info";
  return "success";
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "Not reported";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not reported";
  return String(value);
}

function hasReportedValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = String(value).trim().toLowerCase();
  return Boolean(
    normalized &&
      !["unknown", "unknown creditor", "not reported", "n/a", "na", "-", "missing"].includes(normalized)
  );
}

function formatBlankValue(value: unknown): string {
  return hasReportedValue(value) ? String(value) : "";
}

function formatDateBlank(value: unknown): string {
  if (!hasReportedValue(value)) return "";
  return formatDateOnlyEnCa(String(value)) ?? String(value);
}

function formatMoneyBlank(value: unknown): string {
  if (!hasReportedValue(value)) return "";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatPaymentHistorySummaryBlank(value: any): string {
  if (!value || typeof value !== "object") return "";
  const parts = [
    ["30", value["30"]],
    ["60", value["60"]],
    ["90", value["90"]],
    ["#M", value["#M"]],
  ]
    .filter(([, partValue]) => hasReportedValue(partValue))
    .map(([label, partValue]) => `${label}: ${partValue}`);

  return parts.length > 0 ? parts.join(" / ") : "";
}

function latestPaymentDetail(tradeline: any): any | null {
  return Array.isArray(tradeline?.paymentHistoryDetails) && tradeline.paymentHistoryDetails.length > 0
    ? tradeline.paymentHistoryDetails[0]
    : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateAuditValue(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 100 ? `${normalized.slice(0, 100)}...` : normalized;
}

function formatAuditScalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    if (!hasReportedValue(value)) return "";
    if (/^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(value)) {
      return formatDateOnlyEnCa(value) ?? value;
    }
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "";
}

function formatAuditCell(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    const first = value[0];
    const preview = isPlainRecord(first)
      ? Object.entries(first)
          .slice(0, 4)
          .map(([key, entryValue]) => `${humanizeKey(key)}: ${formatAuditScalar(entryValue)}`)
          .filter((part) => !part.endsWith(": "))
          .join("; ")
      : value.map(formatAuditScalar).filter(Boolean).join(", ");
    return truncateAuditValue(`${value.length} item${value.length === 1 ? "" : "s"}${preview ? ` - ${preview}` : ""}`);
  }

  if (isPlainRecord(value)) {
    const preview = Object.entries(value)
      .slice(0, 6)
      .map(([key, entryValue]) => `${humanizeKey(key)}: ${formatAuditScalar(entryValue)}`)
      .filter((part) => !part.endsWith(": "))
      .join("; ");
    return truncateAuditValue(preview);
  }

  return truncateAuditValue(formatAuditScalar(value));
}

function sectionValue(source: any, key: string): unknown {
  return source && typeof source === "object" ? source[key] : undefined;
}

const AUDIT_PRIORITY_COLUMNS = [
  "creditorName",
  "accountNumber",
  "accountType",
  "balance",
  "currentBalance",
  "monthlyPayment",
  "scheduledMonthlyPayment",
  "paymentFrequency",
  "payment",
  "pastDue",
  "highCredit",
  "creditLimit",
  "originalBalance",
  "amounts",
  "status",
  "dates",
  "paymentHistory",
  "paymentHistoryProfile",
  "paymentPattern",
  "monthsReviewed",
  "paymentHistoryDetails",
  "sourceText",
];

function orderAuditColumns(columns: string[]): string[] {
  return [
    ...AUDIT_PRIORITY_COLUMNS.filter((column) => columns.includes(column)),
    ...columns.filter((column) => !AUDIT_PRIORITY_COLUMNS.includes(column)),
  ];
}

function withoutArrayFields(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => !Array.isArray(entryValue))
  );
}

function reviewTitle(item: any, tradeline: any): string {
  if (item.kind === "report") return "Report level";
  const creditor = hasReportedValue(tradeline?.creditorName)
    ? tradeline.creditorName
    : hasReportedValue(item.creditorName)
      ? item.creditorName
      : `Tradeline ${typeof item.index === "number" ? item.index + 1 : ""}`.trim();
  const account = hasReportedValue(tradeline?.accountNumber)
    ? tradeline.accountNumber
    : hasReportedValue(item.accountNumber)
      ? item.accountNumber
      : null;
  return account ? `${creditor} - ${account}` : creditor;
}

function downloadJson(result: ParserLabResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `parser-lab-${result.fileName.replace(/[^a-z0-9.-]+/gi, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildStageLabTestCaseName(result: ParserLabResult): string {
  const sourceName = result.fileName.replace(/\.pdf$/i, "").trim() || "Credit Report";
  const bureau = hasReportedValue(result.bureauName) ? String(result.bureauName) : "Unknown Bureau";
  return `${bureau} Stage Lab - ${sourceName}`;
}

function buildStageLabTestCaseDescription(result: ParserLabResult): string {
  const allowAiFallback = Boolean((result.provenance as any)?.allowAiFallback);
  return [
    "Created from Stage Lab parser run.",
    `Source file: ${result.fileName}`,
    `Stage version: ${result.stageVersion}`,
    `Bureau: ${formatValue(result.bureauName)}`,
    `Parser mode: ${allowAiFallback ? "AI fallback enabled" : "Deterministic only"}`,
    `Confidence: ${result.quality.confidenceScore}%`,
    `Original SHA-256: ${result.retention.originalDocumentSha256}`,
    `Canonical SHA-256: ${result.retention.canonicalResultSha256}`,
  ].join("\n");
}

function buildStageLabTestCasePayload(
  result: ParserLabResult,
  pdfBase64: string,
): StageLabTestCasePayload {
  const parsedResult = isPlainRecord(result.audit?.parsedResult)
    ? result.audit.parsedResult
    : {};
  const allowAiFallback = Boolean((result.provenance as any)?.allowAiFallback);

  return {
    name: buildStageLabTestCaseName(result),
    description: buildStageLabTestCaseDescription(result),
    pdfBase64,
    expectedConsumerInfo: parsedResult.consumerInfo ?? result.parsed.consumerInfo,
    expectedTradelines: Array.isArray(parsedResult.tradelines)
      ? parsedResult.tradelines
      : result.parsed.tradelines,
    rawExtractedText: result.rawExtractedText || result.rawTextPreview || null,
    bureau: hasReportedValue(result.bureauName) ? String(result.bureauName) : null,
    parserMode: allowAiFallback ? "ai_fallback_enabled" : "deterministic",
    allowAiFallback,
    stageVersion: result.stageVersion,
    extractionSource: result.extractionSource,
    parserContext: {
      sourceFileName: result.fileName,
      bureauName: result.bureauName,
      parserMode: allowAiFallback ? "ai_fallback_enabled" : "deterministic",
      allowAiFallback,
      stageVersion: result.stageVersion,
      extractionSource: result.extractionSource,
      quality: result.quality,
      retention: result.retention,
      counts: result.counts,
      parsed: result.parsed,
      audit: result.audit,
      reviewQueue: result.reviewQueue,
      provenance: result.provenance,
    },
  };
}

function TradelineFieldGrid({ tradeline, className }: { tradeline: any; className: string }) {
  const latestPayment = latestPaymentDetail(tradeline);
  const fields = [
    ["Creditor Name", formatBlankValue(tradeline.creditorName)],
    ["Account Number", formatBlankValue(tradeline.accountNumber)],
    ["Account Type", formatBlankValue(tradeline.accountType)],
    ["Responsibility", formatBlankValue(tradeline.responsibilityCode)],
    ["Status", formatBlankValue(tradeline.status)],
    ["Payment History", formatPaymentHistorySummaryBlank(tradeline.paymentHistory)],
    ["Payment Profile", formatBlankValue(tradeline.paymentHistoryProfile || tradeline.paymentPattern)],
    ["Months Reviewed", formatBlankValue(tradeline.monthsReviewed)],
    ["Reported Date", formatDateBlank(tradeline.dates?.reported)],
    ["Opened Date", formatDateBlank(tradeline.dates?.opened)],
    ["Closed Date", formatDateBlank(tradeline.dates?.closed)],
    ["First Delinquency Date", formatDateBlank(tradeline.dates?.dofd)],
    ["Last Payment Date", formatDateBlank(tradeline.dates?.lastPayment)],
    ["Last Activity Date", formatDateBlank(tradeline.dates?.lastActivity)],
    ["Posted Date", formatDateBlank(tradeline.dates?.posted)],
    ["Charge Off Date", formatDateBlank(tradeline.dates?.chargeOff)],
    ["Balloon Payment Date", formatDateBlank(tradeline.dates?.balloonPayment)],
    ["Balance", formatMoneyBlank(tradeline.balance)],
    ["Payment", formatMoneyBlank(latestPayment?.payment ?? tradeline.monthlyPayment ?? tradeline.scheduledMonthlyPayment)],
    ["Payment Frequency", formatBlankValue(tradeline.paymentFrequency)],
    ["Past Due", formatMoneyBlank(tradeline.pastDue)],
    ["MOP", formatBlankValue(latestPayment?.mop ?? tradeline.mop)],
    ["Terms", formatBlankValue(tradeline.terms)],
    ["High Credit", formatMoneyBlank(tradeline.highCredit)],
    ["Credit Limit", formatMoneyBlank(tradeline.creditLimit)],
    ["Balloon Payment", formatMoneyBlank(latestPayment?.balloonPayment)],
    ["Charge Off", formatMoneyBlank(latestPayment?.chargeOff)],
    ["Narrative", formatBlankValue(latestPayment?.narrative)],
    ["Legend", formatBlankValue(tradeline.legend)],
    ["Source Text Characters", formatBlankValue(tradeline.sourceTextCharacters)],
    ["Payment Rows", formatBlankValue(tradeline.paymentHistoryDetailsCount)],
  ];

  return (
    <div className={className}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <span className={styles.fieldLabel}>{label}</span>
          <span className={styles.fieldValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function FinancialSnapshot({
  tradeline,
  className,
}: {
  tradeline: any;
  className: string;
}) {
  const latestPayment = latestPaymentDetail(tradeline);
  const fields = [
    ["Balance", formatMoneyBlank(tradeline.balance)],
    ["Payment", formatMoneyBlank(latestPayment?.payment ?? tradeline.monthlyPayment ?? tradeline.scheduledMonthlyPayment)],
    ["Frequency", formatBlankValue(tradeline.paymentFrequency)],
    ["Past Due", formatMoneyBlank(tradeline.pastDue)],
    ["High Credit", formatMoneyBlank(tradeline.highCredit)],
    ["Credit Limit", formatMoneyBlank(tradeline.creditLimit)],
  ];

  return (
    <div className={className}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <span className={styles.fieldLabel}>{label}</span>
          <span className={styles.financialValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentHistoryRows({ rows }: { rows: any[] | null | undefined }) {
  const displayRows = Array.isArray(rows) && rows.length > 0 ? rows : [{}];

  return (
    <div className={styles.paymentHistoryBlock}>
      <span className={styles.subsectionLabel}>Payment history rows</span>
      <div className={styles.tableScroller}>
        <table className={styles.paymentTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Balance</th>
              <th>Payment</th>
              <th>Past due</th>
              <th>MOP</th>
              <th>Terms</th>
              <th>High credit</th>
              <th>Credit limit</th>
              <th>Balloon</th>
              <th>Charge off</th>
              <th>Narrative</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, index) => (
              <tr key={`${row.date || "row"}-${index}`}>
                <td>{formatBlankValue(row.date)}</td>
                <td>{formatMoneyBlank(row.balance)}</td>
                <td>{formatMoneyBlank(row.payment)}</td>
                <td>{formatMoneyBlank(row.pastDue)}</td>
                <td>{formatBlankValue(row.mop)}</td>
                <td>{formatBlankValue(row.terms)}</td>
                <td>{formatMoneyBlank(row.highCredit)}</td>
                <td>{formatMoneyBlank(row.creditLimit)}</td>
                <td>{formatMoneyBlank(row.balloonPayment)}</td>
                <td>{formatMoneyBlank(row.chargeOff)}</td>
                <td>{formatBlankValue(row.narrative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceEvidencePreview({
  tradeline,
}: {
  tradeline: any;
}) {
  return (
    <details className={styles.evidenceDetails}>
      <summary>Source evidence preview</summary>
      <div className={styles.evidenceBody}>
        <TradelineFieldGrid tradeline={tradeline} className={styles.evidenceFieldGrid} />
        <PaymentHistoryRows rows={tradeline.paymentHistoryDetails} />
      </div>
    </details>
  );
}

function AuditObjectSection({ title, value }: { title: string; value: unknown }) {
  const record = isPlainRecord(value) ? value : {};
  const entries = Object.entries(record);

  return (
    <details className={styles.auditSection} open>
      <summary>{title}</summary>
      <div className={styles.auditGrid}>
        {entries.length > 0 ? (
          entries.map(([key, entryValue]) => (
            <div key={key} className={styles.auditField}>
              <span className={styles.fieldLabel}>{humanizeKey(key)}</span>
              <span className={styles.fieldValue}>{formatAuditCell(entryValue)}</span>
            </div>
          ))
        ) : (
          <div className={styles.auditField}>
            <span className={styles.fieldLabel}>Data</span>
            <span className={styles.fieldValue} />
          </div>
        )}
      </div>
    </details>
  );
}

function AuditArraySection({ title, value }: { title: string; value: unknown }) {
  const rows = Array.isArray(value) ? value : [];
  const records = rows.map((row) => (isPlainRecord(row) ? row : { value: row }));
  const columns = orderAuditColumns(
    Array.from(new Set(records.flatMap((record) => Object.keys(record))))
  );

  return (
    <details className={styles.auditSection} open>
      <summary>
        {title} <span className={styles.auditCount}>{rows.length}</span>
      </summary>
      <div className={styles.tableScroller}>
        <table className={styles.auditTable}>
          <thead>
            <tr>
              {(columns.length > 0 ? columns : ["value"]).map((column) => (
                <th key={column}>{humanizeKey(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length > 0 ? (
              records.map((record, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => {
                    const cell = record[column];
                    return (
                      <td key={column}>{formatAuditCell(cell)}</td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StageLabResults({ result }: { result: ParserLabResult }) {
  return (
    <>
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle}>Run Summary</h3>
            <p className={styles.panelSubtitle}>{result.stageVersion}</p>
          </div>
          <Badge variant={qualityVariant(result.quality.confidenceScore)}>
            {result.quality.confidenceScore}% confidence
          </Badge>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Bureau</span>
            <span className={styles.metaValue}>{formatValue(result.bureauName)}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Source</span>
            <span className={styles.metaValue}>{result.extractionSource}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Side effects</span>
            <span className={styles.metaValue}>{result.sideEffects}</span>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Retention Metrics</h3>
          <Badge variant={result.quality.requiresManualReview ? "warning" : "success"}>
            {result.quality.requiresManualReview ? "Review required" : "Review clear"}
          </Badge>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Critical fields</span>
            <span className={styles.metricValue}>{result.retention.criticalFieldCompletenessPercent}%</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Source coverage</span>
            <span className={styles.metricValue}>{result.retention.sourceTextCoveragePercent}%</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Review queue</span>
            <span className={styles.metricValue}>{result.retention.reviewQueueCount}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Raw text chars</span>
            <span className={styles.metricValue}>{result.retention.rawTextCharacters}</span>
          </div>
        </div>

        <div className={styles.metaGrid} style={{ marginTop: "var(--spacing-4)" }}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Original SHA-256</span>
            <span className={`${styles.metaValue} ${styles.hash}`}>
              {result.retention.originalDocumentSha256}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Canonical SHA-256</span>
            <span className={`${styles.metaValue} ${styles.hash}`}>
              {result.retention.canonicalResultSha256}
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Source-backed tradelines</span>
            <span className={styles.metaValue}>
              {result.retention.tradelinesWithSourceText} of {result.counts.tradelines}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Extracted Counts</h3>
        </div>
        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Tradelines</span>
            <span className={styles.metricValue}>{result.counts.tradelines}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Inquiries</span>
            <span className={styles.metricValue}>{result.counts.inquiries}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Employments</span>
            <span className={styles.metricValue}>{result.counts.employments}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Scores</span>
            <span className={styles.metricValue}>{result.counts.scores}</span>
          </div>
        </div>
      </div>

      {(result.quality.issues.length > 0 || result.retention.blockers.length > 0) && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Quality Gates</h3>
          </div>
          <div className={styles.issueList}>
            {result.retention.blockers.map((blocker) => (
              <div key={blocker} className={styles.issue}>
                <div className={styles.issueHeader}>
                  <span className={styles.entityTitle}>{blocker}</span>
                  <Badge variant="warning">Blocker</Badge>
                </div>
              </div>
            ))}
            {result.quality.issues.map((issue) => (
              <div key={`${issue.code}-${issue.message}`} className={styles.issue}>
                <div className={styles.issueHeader}>
                  <span className={styles.entityTitle}>{issue.code}</span>
                  <Badge variant={severityVariant(issue.severity)}>{issue.severity}</Badge>
                </div>
                <p>{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ReviewQueuePanel({ result }: { result: ParserLabResult }) {
  const parsedTradelines = Array.isArray(result.parsed.tradelines) ? result.parsed.tradelines : [];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.panelTitle}>Review Queue</h3>
          <p className={styles.panelSubtitle}>Items that need manual parser review from this stage lab run.</p>
        </div>
        <Badge variant={result.reviewQueue.length > 0 ? "warning" : "success"}>{result.reviewQueue.length}</Badge>
      </div>

      {result.reviewQueue.length > 0 ? (
        <div className={styles.reviewList}>
          {result.reviewQueue.map((item, index) => {
            const tradeline =
              item.kind === "tradeline" && typeof item.index === "number"
                ? parsedTradelines[item.index]
                : null;

            return (
              <div key={`${item.kind}-${item.index ?? "report"}-${index}`} className={styles.reviewItem}>
                <div className={styles.reviewHeader}>
                  <span className={styles.entityTitle}>{reviewTitle(item, tradeline)}</span>
                  <Badge variant="warning">{item.kind}</Badge>
                </div>

                <div className={styles.reviewReasons}>
                  {item.reasons.map((reason) => (
                    <Badge key={reason} variant="warning" className={styles.reasonBadge}>
                      {reason}
                    </Badge>
                  ))}
                </div>

                {tradeline && <FinancialSnapshot tradeline={tradeline} className={styles.reviewSummaryGrid} />}
                {tradeline && <SourceEvidencePreview tradeline={tradeline} />}
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.panelSubtitle}>No review items were generated for this parser run.</p>
      )}
    </div>
  );
}

function ParsedTradelinesPanel({ result }: { result: ParserLabResult }) {
  const tradelines = Array.isArray(result.parsed.tradelines) ? result.parsed.tradelines : [];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.panelTitle}>Parsed Tradelines</h3>
          <p className={styles.panelSubtitle}>Tradeline fields extracted by the stage lab parser.</p>
        </div>
        <Badge variant="info">{tradelines.length}</Badge>
      </div>

      {tradelines.length > 0 ? (
        <div className={styles.tradelineList}>
          {tradelines.map((tradeline: any, index: number) => (
            <div
              key={`${tradeline.index ?? index}-${tradeline.creditorName}-${tradeline.accountNumber}`}
              className={styles.tradeline}
            >
              <div className={styles.tradelineHeader}>
                <span className={styles.entityTitle}>{formatValue(tradeline.creditorName)}</span>
                <Badge variant={tradeline.needsReview ? "warning" : "success"}>
                  {tradeline.needsReview ? "Needs review" : "Source-backed"}
                </Badge>
              </div>
              <FinancialSnapshot tradeline={tradeline} className={styles.financialSnapshot} />
              <TradelineFieldGrid tradeline={tradeline} className={styles.fieldGrid} />
              <PaymentHistoryRows rows={tradeline.paymentHistoryDetails} />
              {tradeline.reviewReasons?.length > 0 && (
                <ul className={styles.reasonList}>
                  {tradeline.reviewReasons.map((reason: string) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.panelSubtitle}>No tradelines were parsed from this document.</p>
      )}
    </div>
  );
}

function RawTextPreviewPanel({ result }: { result: ParserLabResult }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.panelTitle}>Raw Text Preview</h3>
          <p className={styles.panelSubtitle}>Extracted source text preview from the uploaded report.</p>
        </div>
      </div>
      <pre className={styles.pre}>{result.rawTextPreview || "No raw text preview was returned."}</pre>
    </div>
  );
}

function CompleteParsedOutput({ result }: { result: ParserLabResult }) {
  const parsed = result.audit?.parsedResult || {};
  const mapped = result.audit?.mappedResult || {};

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3 className={styles.panelTitle}>Complete Parsed Output</h3>
          <p className={styles.panelSubtitle}>Full parser result and canonical mapped output for audit testing.</p>
        </div>
      </div>

      <div className={styles.auditGroup}>
        <h4 className={styles.auditGroupTitle}>Parsed Result</h4>
        <AuditObjectSection title="Report Metadata" value={sectionValue(parsed, "reportMetadata")} />
        <AuditObjectSection title="Consumer Info" value={sectionValue(parsed, "consumerInfo")} />
        <AuditArraySection title="Tradelines" value={sectionValue(parsed, "tradelines")} />
        <AuditArraySection title="Payment Histories" value={sectionValue(parsed, "paymentHistories")} />
        <AuditArraySection title="Inquiries" value={sectionValue(parsed, "inquiries")} />
        <AuditArraySection title="Public Records" value={sectionValue(parsed, "publicRecords")} />
        <AuditArraySection title="Employment Info" value={sectionValue(parsed, "employmentInfo")} />
        <AuditArraySection title="Credit Scores" value={sectionValue(parsed, "creditScores")} />
        <AuditArraySection title="Consumer Statements" value={sectionValue(parsed, "consumerStatements")} />
      </div>

      <div className={styles.auditGroup}>
        <h4 className={styles.auditGroupTitle}>Canonical Mapped Output</h4>
        <AuditObjectSection title="Mapped Report Fields" value={withoutArrayFields(mapped)} />
        <AuditArraySection title="Mapped Tradelines" value={sectionValue(mapped, "tradelines")} />
        <AuditArraySection title="Mapped Inquiries" value={sectionValue(mapped, "inquiries")} />
        <AuditArraySection title="Mapped Credit Related Inquiries" value={sectionValue(mapped, "creditRelatedInquiries")} />
        <AuditArraySection title="Mapped Non-Credit Related Inquiries" value={sectionValue(mapped, "nonCreditRelatedInquiries")} />
        <AuditArraySection title="Mapped Public Records" value={sectionValue(mapped, "publicRecords")} />
        <AuditArraySection title="Mapped Employments" value={sectionValue(mapped, "employments")} />
        <AuditArraySection title="Mapped Scores" value={sectionValue(mapped, "scores")} />
      </div>
    </div>
  );
}

function StaleResultNotice({
  result,
  onClear,
}: {
  result: ParserLabResult;
  onClear: () => void;
}) {
  return (
    <div className={`${styles.panel} ${styles.emptyState}`}>
      <div>
        <ShieldCheck size={28} />
        <h3 className={styles.panelTitle}>Parser result needs rerun</h3>
        <p>
          This result was generated by {result.stageVersion || "an older parser stage"}.
          Current Stage Lab parser is {PARSER_LAB_STAGE_VERSION}.
        </p>
        <Button variant="outline" onClick={onClear}>
          <RotateCcw size={16} /> Clear stale result
        </Button>
      </div>
    </div>
  );
}

export function ParserLabStageTab({
  onSaveAsTestCase,
  isSavingTestCase = false,
}: ParserLabStageTabProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [allowAiFallback, setAllowAiFallback] = useState(AI_FALLBACK_AVAILABLE);
  const [result, setResult] = useState<ParserLabResult | null>(null);
  const [resultPdfBase64, setResultPdfBase64] = useState<string | null>(null);
  const [savedTestCaseId, setSavedTestCaseId] = useState<number | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("results");
  const runMutation = useRunParserLabStage();
  const isStaleResult = Boolean(result && result.stageVersion !== PARSER_LAB_STAGE_VERSION);

  const handleFilesSelected = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setResultPdfBase64(null);
    setSavedTestCaseId(null);
    setActiveResultTab("results");
  };

  const handleRun = async () => {
    if (!selectedFile) {
      toast.error("Select a PDF first");
      return;
    }

    try {
      const bytesBase64 = await readFileAsBase64(selectedFile);
      const nextResult = await runMutation.mutateAsync({
        fileName: selectedFile.name,
        mimeType: selectedFile.type || "application/pdf",
        bytesBase64,
        allowAiFallback: AI_FALLBACK_AVAILABLE && allowAiFallback,
      });
      setResult(nextResult);
      setResultPdfBase64(bytesBase64);
      setSavedTestCaseId(null);
      setActiveResultTab("results");
      toast.success("Parser lab run completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Parser lab run failed");
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setResult(null);
    setResultPdfBase64(null);
    setSavedTestCaseId(null);
    setActiveResultTab("results");
    runMutation.reset();
  };

  const handleSaveAsTestCase = async () => {
    if (!result || !resultPdfBase64 || !onSaveAsTestCase) return;

    try {
      const saved = await onSaveAsTestCase(buildStageLabTestCasePayload(result, resultPdfBase64));
      const savedId = saved && "testCase" in saved ? saved.testCase?.id : undefined;
      setSavedTestCaseId(savedId ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Stage Lab run");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.controlPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>Shadow Parser Lab</h3>
              <p className={styles.panelSubtitle}>Admin-only extraction, with optional save to Test Cases.</p>
            </div>
            <ShieldCheck size={20} />
          </div>

          <FileDropzone
            accept=".pdf"
            disabled={runMutation.isPending}
            onFilesSelected={handleFilesSelected}
            title="Upload bureau PDF"
            subtitle="TransUnion or Equifax consumer disclosure"
          />

          {selectedFile && (
            <div className={styles.selectedFile}>
              <span className={styles.fileName}>{selectedFile.name}</span>
              <Button variant="ghost" size="sm" onClick={reset} disabled={runMutation.isPending}>
                <RotateCcw size={16} /> Clear
              </Button>
            </div>
          )}

          <div className={styles.controlRow}>
            <div>
              <span className={styles.controlLabel}>AI fallback</span>
              <span className={styles.controlHelp}>
                {AI_FALLBACK_AVAILABLE
                  ? "Only used when deterministic extraction needs help."
                  : "Suspended pending controlled parser testing."}
              </span>
            </div>
            <Switch
              checked={AI_FALLBACK_AVAILABLE && allowAiFallback}
              disabled={!AI_FALLBACK_AVAILABLE}
              onCheckedChange={setAllowAiFallback}
            />
          </div>

          <div className={styles.actions}>
            <Button onClick={handleRun} disabled={!selectedFile || runMutation.isPending}>
              {runMutation.isPending ? <Spinner size="sm" /> : <Play size={16} />}
              Run Shadow Parse
            </Button>
            {result && (
              <Button variant="outline" onClick={() => downloadJson(result)}>
                <Download size={16} /> Export JSON
              </Button>
            )}
            {result && onSaveAsTestCase && !isStaleResult && (
              <Button
                variant="secondary"
                onClick={handleSaveAsTestCase}
                disabled={!resultPdfBase64 || isSavingTestCase || savedTestCaseId !== null}
              >
                {isSavingTestCase ? <Spinner size="sm" /> : <Save size={16} />}
                {savedTestCaseId !== null ? "Saved to Test Cases" : "Save to Test Cases"}
              </Button>
            )}
          </div>
        </section>

        <section className={styles.results}>
          {!result ? (
            <div className={`${styles.panel} ${styles.emptyState}`}>
              <div>
                <FileJson size={28} />
                <p>Run a shadow parse to see quality gates, retention metrics, and review items.</p>
              </div>
            </div>
          ) : isStaleResult ? (
            <StaleResultNotice
              result={result}
              onClear={() => {
                setResult(null);
                setActiveResultTab("results");
              }}
            />
          ) : (
            <>
              <div className={styles.resultTabs} role="tablist" aria-label="Parser lab result views">
                {RESULT_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={activeResultTab === tab.value}
                    className={`${styles.resultTabButton} ${
                      activeResultTab === tab.value ? styles.resultTabButtonActive : ""
                    }`}
                    onClick={() => setActiveResultTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeResultTab === "results" && <StageLabResults result={result} />}
              {activeResultTab === "review" && <ReviewQueuePanel result={result} />}
              {activeResultTab === "tradelines" && <ParsedTradelinesPanel result={result} />}
              {activeResultTab === "raw" && <RawTextPreviewPanel result={result} />}
              {activeResultTab === "audit" && <CompleteParsedOutput result={result} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
