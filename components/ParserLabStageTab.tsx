import { useState } from "react";
import { Download, FileJson, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { Spinner } from "./Spinner";
import { Switch } from "./Switch";
import { useRunParserLabStage } from "../helpers/parserLabQueries";
import styles from "./ParserLabStageTab.module.css";

type ParserLabResult = Awaited<ReturnType<ReturnType<typeof useRunParserLabStage>["mutateAsync"]>>;

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

function formatDateValue(value: unknown): string {
  if (!hasReportedValue(value)) return "Not reported";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-CA");
}

function formatMoneyValue(value: unknown): string {
  if (!hasReportedValue(value)) return "Not reported";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatDisplayValue(value: unknown): string {
  return hasReportedValue(value) ? String(value) : "Not reported";
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

function formatEvidencePreview(value: string): string {
  const labels = [
    "Creditor Name",
    "Payment History",
    "Reported Date",
    "Opened Date",
    "Closed Date",
    "First Delinquency Date",
    "Last Payment Date",
    "Posted Date",
    "Charge Off Date",
    "Balloon Payment Date",
    "Terms",
    "Account Type",
    "Balance",
    "Payment",
    "Past Due",
    "MOP",
    "High Credit",
    "Credit Limit",
    "Narrative",
    "Legend",
  ];

  let formatted = value.replace(/\s+/g, " ").trim();
  for (const label of labels) {
    formatted = formatted.replace(new RegExp(`\\s*(${label})\\s*`, "gi"), "\n$1: ");
  }

  return formatted
    .replace(/\n+/g, "\n")
    .replace(/^:/gm, "")
    .trim();
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

export function ParserLabStageTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [allowAiFallback, setAllowAiFallback] = useState(true);
  const [result, setResult] = useState<ParserLabResult | null>(null);
  const runMutation = useRunParserLabStage();

  const handleFilesSelected = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
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
        allowAiFallback,
      });
      setResult(nextResult);
      toast.success("Parser lab run completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Parser lab run failed");
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setResult(null);
    runMutation.reset();
  };

  return (
    <div className={styles.container}>
      <div className={styles.layout}>
        <section className={`${styles.panel} ${styles.controlPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>Shadow Parser Lab</h3>
              <p className={styles.panelSubtitle}>Admin-only extraction without persistence.</p>
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
              <span className={styles.controlHelp}>Only used when deterministic extraction needs help.</span>
            </div>
            <Switch checked={allowAiFallback} onCheckedChange={setAllowAiFallback} />
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
          ) : (
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

              {result.reviewQueue.length > 0 && (
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <h3 className={styles.panelTitle}>Review Queue</h3>
                    <Badge variant="warning">{result.reviewQueue.length}</Badge>
                  </div>
                  <div className={styles.reviewList}>
                    {result.reviewQueue.map((item, index) => (
                      (() => {
                        const tradeline =
                          item.kind === "tradeline" &&
                          typeof item.index === "number" &&
                          Array.isArray(result.parsed.tradelines)
                            ? (result.parsed.tradelines as any[])[item.index]
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

                            {tradeline && (
                              <div className={styles.reviewSummaryGrid}>
                                <div>
                                  <span className={styles.fieldLabel}>Creditor</span>
                                  <span className={styles.fieldValue}>{formatDisplayValue(tradeline.creditorName)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Account</span>
                                  <span className={styles.fieldValue}>{formatDisplayValue(tradeline.accountNumber)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Type</span>
                                  <span className={styles.fieldValue}>{formatDisplayValue(tradeline.accountType)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Status</span>
                                  <span className={styles.fieldValue}>{formatDisplayValue(tradeline.status)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Balance</span>
                                  <span className={styles.fieldValue}>{formatMoneyValue(tradeline.balance)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Credit limit</span>
                                  <span className={styles.fieldValue}>{formatMoneyValue(tradeline.creditLimit)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Reported</span>
                                  <span className={styles.fieldValue}>{formatDateValue(tradeline.dates?.reported)}</span>
                                </div>
                                <div>
                                  <span className={styles.fieldLabel}>Last payment</span>
                                  <span className={styles.fieldValue}>{formatDateValue(tradeline.dates?.lastPayment)}</span>
                                </div>
                              </div>
                            )}

                            {item.sourceTextPreview && (
                              <details className={styles.evidenceDetails}>
                                <summary>Source evidence preview</summary>
                                <pre className={styles.evidenceText}>{formatEvidencePreview(item.sourceTextPreview)}</pre>
                              </details>
                            )}
                          </div>
                        );
                      })()
                    ))}
                  </div>
                </div>
              )}

              {result.parsed.tradelines && Array.isArray(result.parsed.tradelines) && (
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <h3 className={styles.panelTitle}>Parsed Tradelines</h3>
                  </div>
                  <div className={styles.tradelineList}>
                    {result.parsed.tradelines.map((tradeline: any) => (
                      <div key={`${tradeline.index}-${tradeline.creditorName}-${tradeline.accountNumber}`} className={styles.tradeline}>
                        <div className={styles.tradelineHeader}>
                          <span className={styles.entityTitle}>
                            {formatValue(tradeline.creditorName)}
                          </span>
                          <Badge variant={tradeline.needsReview ? "warning" : "success"}>
                            {tradeline.needsReview ? "Needs review" : "Source-backed"}
                          </Badge>
                        </div>
                        <div className={styles.fieldGrid}>
                          <div>
                            <span className={styles.fieldLabel}>Account</span>
                            <span className={styles.fieldValue}>{formatDisplayValue(tradeline.accountNumber)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Type</span>
                            <span className={styles.fieldValue}>{formatDisplayValue(tradeline.accountType)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Status</span>
                            <span className={styles.fieldValue}>{formatDisplayValue(tradeline.status)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Balance</span>
                            <span className={styles.fieldValue}>{formatMoneyValue(tradeline.balance)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Reported</span>
                            <span className={styles.fieldValue}>{formatDateValue(tradeline.dates?.reported)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Opened</span>
                            <span className={styles.fieldValue}>{formatDateValue(tradeline.dates?.opened)}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Source chars</span>
                            <span className={styles.fieldValue}>{tradeline.sourceTextCharacters}</span>
                          </div>
                          <div>
                            <span className={styles.fieldLabel}>Payment rows</span>
                            <span className={styles.fieldValue}>{tradeline.paymentHistoryDetailsCount}</span>
                          </div>
                        </div>
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
                </div>
              )}

              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h3 className={styles.panelTitle}>Raw Text Preview</h3>
                </div>
                <pre className={styles.pre}>{result.rawTextPreview}</pre>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
