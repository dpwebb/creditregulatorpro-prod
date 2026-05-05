import React from "react";
import { CheckCircle, ChevronDown, ChevronRight, Database, Flag } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import styles from "./ParserTestSavedOutputPanel.module.css";

interface ParserTestSavedOutputPanelProps {
  testCase: any;
  emptyIcon?: React.ReactNode;
  onAdjudicate?: (data: any) => Promise<void>;
  isAdjudicating?: boolean;
}

type JsonRecord = Record<string, unknown>;

type DecisionDraft = {
  entityType: string;
  entityKey: string;
  fieldPath: string;
  decision: string;
  correctValue: string;
  sourceEvidence: string;
  reason: string;
};

const EMPTY_DECISION_DRAFT: DecisionDraft = {
  entityType: "tradeline",
  entityKey: "",
  fieldPath: "",
  decision: "corrected",
  correctValue: "",
  sourceEvidence: "",
  reason: "",
};

const IMPORTANT_TRADELINE_FIELDS: Array<[string, (tradeline: JsonRecord) => unknown]> = [
  ["Creditor Name", (tradeline) => tradeline.creditorName],
  ["Account Number", (tradeline) => tradeline.accountNumber],
  ["Account Type", (tradeline) => tradeline.accountType],
  ["Status", (tradeline) => tradeline.status],
  ["Balance", (tradeline) => tradeline.balance],
  ["High Credit", (tradeline) => nestedValue(tradeline, ["amounts", "high"]) ?? tradeline.highCredit],
  ["Credit Limit", (tradeline) => nestedValue(tradeline, ["amounts", "limit"]) ?? tradeline.creditLimit],
  ["Past Due", (tradeline) => nestedValue(tradeline, ["amounts", "pastDue"]) ?? tradeline.pastDue],
  ["Monthly Payment", (tradeline) => tradeline.monthlyPayment],
  ["Opened Date", (tradeline) => nestedValue(tradeline, ["dates", "opened"])],
  ["Reported Date", (tradeline) => nestedValue(tradeline, ["dates", "reported"])],
  ["Closed Date", (tradeline) => nestedValue(tradeline, ["dates", "closed"])],
  ["First Delinquency Date", (tradeline) => nestedValue(tradeline, ["dates", "dofd"])],
  ["Last Payment Date", (tradeline) => tradeline.lastPaymentDate],
  ["Last Activity Date", (tradeline) => tradeline.lastActivityDate],
  ["Terms", (tradeline) => tradeline.terms],
  ["MOP", (tradeline) => tradeline.mop],
  ["Payment Profile", (tradeline) => tradeline.paymentHistoryProfile ?? tradeline.paymentPattern],
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nestedValue(record: JsonRecord, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, record);
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA");
}

function formatScalar(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") {
    const isoDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDate(value) : null;
    return isoDate ?? value;
  }
  return "";
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entryValue]) => `${humanizeKey(key)}: ${formatScalar(entryValue)}`)
      .filter((part) => !part.endsWith(": "))
      .slice(0, 4)
      .join("; ");
  }

  return formatScalar(value);
}

function truncate(value: string, maxLength = 100): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function FieldTable({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <div className={styles.tableScroller}>
      <table className={styles.table}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{truncate(summarizeValue(value))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectTable({ record }: { record: JsonRecord }) {
  const rows = Object.entries(record)
    .filter(([key]) => key !== "sourceText")
    .map(([key, value]) => [humanizeKey(key), value] as [string, unknown]);

  return <FieldTable rows={rows.length > 0 ? rows : [["Data", ""]]} />;
}

function PaymentHistoryTable({ rows }: { rows: unknown }) {
  const records = Array.isArray(rows) ? rows.filter(isRecord) : [];
  if (records.length === 0) return null;

  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record)))).slice(0, 12);

  return (
    <div className={styles.subsection}>
      <h5 className={styles.subsectionTitle}>Payment History Rows</h5>
      <div className={styles.tableScroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{humanizeKey(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{truncate(summarizeValue(record[column]))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SavedTradelineCard({ tradeline, index }: { tradeline: JsonRecord; index: number }) {
  const [isOpen, setIsOpen] = React.useState(index === 0);
  const title = formatScalar(tradeline.creditorName) || `Tradeline ${index + 1}`;
  const accountNumber = formatScalar(tradeline.accountNumber);
  const accountType = formatScalar(tradeline.accountType);
  const sourceText = formatScalar(tradeline.sourceText);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className={styles.tradelineCard}>
      <Collapsible.Trigger className={styles.tradelineHeader}>
        <div className={styles.tradelineTitle}>
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>{title}</span>
          {accountNumber && <span className={styles.mutedText}>{accountNumber}</span>}
        </div>
        {accountType && <Badge variant="default">{accountType}</Badge>}
      </Collapsible.Trigger>
      <Collapsible.Content className={styles.tradelineBody}>
        <FieldTable rows={IMPORTANT_TRADELINE_FIELDS.map(([label, getValue]) => [label, getValue(tradeline)])} />
        <div className={styles.subsection}>
          <h5 className={styles.subsectionTitle}>All Saved Fields</h5>
          <ObjectTable record={tradeline} />
        </div>
        <PaymentHistoryTable rows={tradeline.paymentHistoryDetails} />
        {sourceText && (
          <details className={styles.sourceDetails}>
            <summary>Source Text</summary>
            <pre className={styles.pre}>{sourceText}</pre>
          </details>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function countPopulatedFields(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((sum, item) => sum + countPopulatedFields(item), 0);
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>((sum, item) => sum + countPopulatedFields(item), 0);
  }
  return formatScalar(value) ? 1 : 0;
}

function statusVariant(status: string): "success" | "warning" | "info" | "default" {
  if (status === "approved") return "success";
  if (status === "needs_parser_rule") return "warning";
  if (status === "partially_reviewed") return "info";
  return "default";
}

function statusLabel(status: string): string {
  return humanizeKey(status || "needs_review");
}

function parserModeLabel(value: unknown): string {
  const mode = formatScalar(value);
  if (mode === "deterministic") return "Deterministic only";
  if (mode === "ai_fallback_enabled") return "AI fallback enabled";
  return mode || "Mode not recorded";
}

function decisionBadgeVariant(decision: string): "success" | "warning" | "info" | "default" {
  if (decision === "accepted") return "success";
  if (decision === "corrected" || decision === "missing") return "warning";
  if (decision === "not_reported") return "info";
  return "default";
}

export function ParserTestSavedOutputPanel({
  testCase,
  emptyIcon,
  onAdjudicate,
  isAdjudicating = false,
}: ParserTestSavedOutputPanelProps) {
  const consumerInfo = isRecord(testCase?.expectedConsumerInfo) ? testCase.expectedConsumerInfo : {};
  const tradelines = Array.isArray(testCase?.expectedTradelines)
    ? testCase.expectedTradelines.filter(isRecord)
    : [];
  const decisions = Array.isArray(testCase?.adjudicationDecisions)
    ? testCase.adjudicationDecisions.filter(isRecord)
    : [];
  const rawText = typeof testCase?.rawExtractedText === "string" ? testCase.rawExtractedText : "";
  const [decisionDraft, setDecisionDraft] = React.useState<DecisionDraft>(EMPTY_DECISION_DRAFT);
  const hasSavedOutput =
    Object.keys(consumerInfo).length > 0 || tradelines.length > 0 || rawText.trim().length > 0;

  const setDraftValue = (key: keyof DecisionDraft, value: string) => {
    setDecisionDraft((current) => ({ ...current, [key]: value }));
  };

  const handleAcceptBaseline = async () => {
    if (!onAdjudicate) return;
    await onAdjudicate({
      testCaseId: testCase.id,
      adminReviewStatus: "approved",
      approvedConsumerInfo: consumerInfo,
      approvedTradelines: tradelines,
      decision: {
        entityType: "report",
        fieldPath: "all_saved_output",
        decision: "accepted",
        parsedValue: {
          consumerInfo,
          tradelines,
        },
        correctValue: {
          consumerInfo,
          tradelines,
        },
        sourceEvidence: "Admin accepted saved parser output as bureau truth for this test case.",
      },
    });
  };

  const handleDecisionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onAdjudicate || !decisionDraft.fieldPath.trim()) return;

    await onAdjudicate({
      testCaseId: testCase.id,
      adminReviewStatus:
        decisionDraft.decision === "accepted" ? "partially_reviewed" : "needs_parser_rule",
      decision: {
        entityType: decisionDraft.entityType,
        entityKey: decisionDraft.entityKey || undefined,
        fieldPath: decisionDraft.fieldPath,
        decision: decisionDraft.decision,
        correctValue:
          decisionDraft.decision === "not_reported" ? null : decisionDraft.correctValue,
        sourceEvidence: decisionDraft.sourceEvidence || undefined,
        reason: decisionDraft.reason || undefined,
      },
    });
    setDecisionDraft(EMPTY_DECISION_DRAFT);
  };

  if (!hasSavedOutput) {
    return (
      <div className={styles.emptyState}>
        {emptyIcon}
        <p>No saved parser output is attached to this test case.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Database size={18} />
          <h3 className={styles.title}>Saved Parser Output</h3>
        </div>
        <Badge variant={statusVariant(testCase?.adminReviewStatus)}>
          {statusLabel(testCase?.adminReviewStatus)}
        </Badge>
      </div>

      <div className={styles.contextGrid}>
        <div>
          <span>Bureau</span>
          <strong>{formatScalar(testCase?.bureau) || "Not detected"}</strong>
        </div>
        <div>
          <span>Parser Mode</span>
          <strong>{parserModeLabel(testCase?.parserMode)}</strong>
        </div>
        <div>
          <span>AI Fallback</span>
          <strong>{testCase?.allowAiFallback === true ? "Allowed" : "Off"}</strong>
        </div>
        <div>
          <span>Stage Version</span>
          <strong>{formatScalar(testCase?.stageVersion) || "Not recorded"}</strong>
        </div>
        <div>
          <span>Extraction Source</span>
          <strong>{formatScalar(testCase?.extractionSource) || "Not recorded"}</strong>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span>Consumer Fields</span>
          <strong>{countPopulatedFields(consumerInfo)}</strong>
        </div>
        <div className={styles.metric}>
          <span>Tradelines</span>
          <strong>{tradelines.length}</strong>
        </div>
        <div className={styles.metric}>
          <span>Raw Text</span>
          <strong>{rawText.length.toLocaleString()} chars</strong>
        </div>
      </div>

      {onAdjudicate && (
        <section className={styles.reviewActions}>
          <div className={styles.reviewActionHeader}>
            <div>
              <h4 className={styles.sectionTitle}>Admin Adjudication</h4>
              <p className={styles.helpText}>
                Accepted values become approved downstream truth. Corrections, missing fields, and not-reported fields stay bureau and parser-mode scoped.
              </p>
            </div>
            <Button onClick={handleAcceptBaseline} disabled={isAdjudicating}>
              <CheckCircle size={16} /> Accept Saved Output
            </Button>
          </div>

          <form className={styles.decisionForm} onSubmit={handleDecisionSubmit}>
            <label>
              <span>Entity</span>
              <select
                value={decisionDraft.entityType}
                onChange={(event) => setDraftValue("entityType", event.target.value)}
              >
                <option value="report">Report</option>
                <option value="consumerInfo">Consumer Info</option>
                <option value="tradeline">Tradeline</option>
                <option value="inquiry">Inquiry</option>
                <option value="employment">Employment</option>
                <option value="publicRecord">Public Record</option>
                <option value="score">Score</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              <span>Entity Key</span>
              <Input
                value={decisionDraft.entityKey}
                onChange={(event) => setDraftValue("entityKey", event.target.value)}
                placeholder="BANK OF NOVA SCOTIA or account key"
              />
            </label>
            <label>
              <span>Field Path</span>
              <Input
                value={decisionDraft.fieldPath}
                onChange={(event) => setDraftValue("fieldPath", event.target.value)}
                placeholder="tradelines[0].creditLimit"
              />
            </label>
            <label>
              <span>Decision</span>
              <select
                value={decisionDraft.decision}
                onChange={(event) => setDraftValue("decision", event.target.value)}
              >
                <option value="corrected">Corrected</option>
                <option value="missing">Missing From Parser</option>
                <option value="not_reported">Not Reported By Bureau</option>
                <option value="accepted">Accepted Field</option>
                <option value="ignored">Ignore</option>
              </select>
            </label>
            <label>
              <span>Correct Value</span>
              <Input
                value={decisionDraft.correctValue}
                onChange={(event) => setDraftValue("correctValue", event.target.value)}
                placeholder="Leave blank when bureau reports no value"
              />
            </label>
            <label className={styles.fullWidth}>
              <span>Source Evidence</span>
              <Textarea
                value={decisionDraft.sourceEvidence}
                onChange={(event) => setDraftValue("sourceEvidence", event.target.value)}
                rows={2}
                placeholder="Quote or describe the original report location supporting the decision"
              />
            </label>
            <label className={styles.fullWidth}>
              <span>Reason / Parser Instruction</span>
              <Textarea
                value={decisionDraft.reason}
                onChange={(event) => setDraftValue("reason", event.target.value)}
                rows={2}
                placeholder="Explain the mapping/parsing issue, e.g. do not map Balloon Payment into Credit Limit"
              />
            </label>
            <div className={styles.formActions}>
              <Button type="submit" variant="secondary" disabled={isAdjudicating || !decisionDraft.fieldPath.trim()}>
                <Flag size={16} /> Save Decision
              </Button>
            </div>
          </form>
        </section>
      )}

      {decisions.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Adjudication Decisions</h4>
          <div className={styles.decisionList}>
            {decisions.map((decision, index) => (
              <div key={formatScalar(decision.id) || index} className={styles.decisionItem}>
                <div className={styles.decisionHeader}>
                  <strong>{formatScalar(decision.fieldPath) || "Field"}</strong>
                  <Badge variant={decisionBadgeVariant(formatScalar(decision.decision))}>
                    {statusLabel(formatScalar(decision.decision))}
                  </Badge>
                </div>
                <p>{truncate(formatScalar(decision.reason) || formatScalar(decision.sourceEvidence) || "No note recorded.", 220)}</p>
                <span className={styles.mutedText}>
                  {formatScalar(decision.entityType)} {formatScalar(decision.entityKey)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Consumer Information</h4>
        <ObjectTable record={consumerInfo} />
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Saved Tradelines</h4>
        <div className={styles.tradelineList}>
          {tradelines.length > 0 ? (
            tradelines.map((tradeline, index) => (
              <SavedTradelineCard
                key={`${formatScalar(tradeline.accountNumber) || index}-${formatScalar(tradeline.creditorName)}`}
                tradeline={tradeline}
                index={index}
              />
            ))
          ) : (
            <div className={styles.emptyInline}>No tradelines saved.</div>
          )}
        </div>
      </section>

      {rawText && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Raw Extracted Text</h4>
          <pre className={styles.pre}>{rawText}</pre>
        </section>
      )}
    </div>
  );
}
