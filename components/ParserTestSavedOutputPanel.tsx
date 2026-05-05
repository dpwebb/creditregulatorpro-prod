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
  selectedFieldId: string;
  entityType: string;
  entityKey: string;
  fieldPath: string;
  decision: string;
  parsedValue: string;
  correctValue: string;
  sourceEvidence: string;
  reason: string;
};

const EMPTY_DECISION_DRAFT: DecisionDraft = {
  selectedFieldId: "",
  entityType: "tradeline",
  entityKey: "",
  fieldPath: "",
  decision: "corrected",
  parsedValue: "",
  correctValue: "",
  sourceEvidence: "",
  reason: "",
};

type FieldOption = {
  id: string;
  label: string;
  entityType: string;
  entityKey: string;
  fieldPath: string;
  parsedValue: unknown;
};

const ENTITY_LABELS: Record<string, string> = {
  report: "Report",
  consumerInfo: "Consumer Info",
  tradeline: "Tradeline",
  inquiry: "Inquiry",
  employment: "Employment",
  publicRecord: "Public Record",
  score: "Score",
  other: "Other",
};

const CONSUMER_FIELD_TEMPLATES = [
  ["fullName", "Full Name"],
  ["dateOfBirth", "Date Of Birth"],
  ["addressLine1", "Address Line 1"],
  ["addressLine2", "Address Line 2"],
  ["city", "City"],
  ["province", "Province"],
  ["postalCode", "Postal Code"],
  ["previousAddresses", "Previous Addresses"],
];

const REPORT_FIELD_TEMPLATES = [
  ["reportMetadata.reportDate", "Report Date"],
  ["reportMetadata.bureauName", "Bureau Name"],
  ["reportMetadata.fileNumber", "File Number"],
  ["reportMetadata.reportNumber", "Report Number"],
  ["reportMetadata.generatedAt", "Generated At"],
];

const TRADELINE_FIELD_TEMPLATES = [
  ["creditorName", "Creditor Name"],
  ["accountNumber", "Account Number"],
  ["accountType", "Account Type"],
  ["responsibilityCode", "Responsibility"],
  ["status", "Status"],
  ["balance", "Balance"],
  ["monthlyPayment", "Payment"],
  ["amounts.pastDue", "Past Due"],
  ["amounts.high", "High Credit"],
  ["amounts.limit", "Credit Limit"],
  ["creditLimit", "Credit Limit"],
  ["dates.reported", "Reported Date"],
  ["dates.opened", "Opened Date"],
  ["dates.closed", "Closed Date"],
  ["dates.dofd", "First Delinquency Date"],
  ["lastPaymentDate", "Last Payment Date"],
  ["lastActivityDate", "Last Activity Date"],
  ["postedDate", "Posted Date"],
  ["chargeOffDate", "Charge Off Date"],
  ["balloonPaymentDate", "Balloon Payment Date"],
  ["terms", "Terms"],
  ["mop", "MOP"],
  ["paymentHistoryProfile", "Payment Profile"],
  ["paymentPattern", "Payment Pattern"],
  ["monthsReviewed", "Months Reviewed"],
  ["paymentHistory.30", "Payment History 30"],
  ["paymentHistory.60", "Payment History 60"],
  ["paymentHistory.90", "Payment History 90"],
  ["paymentHistory.#M", "Payment History #M"],
  ["remarkCodes", "Remark Codes"],
  ["narrative", "Narrative"],
  ["legend", "Legend"],
];

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

function valueAtPath(record: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
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

function optionId(entityType: string, entityKey: string, fieldPath: string): string {
  return `${entityType}|${entityKey}|${fieldPath}`;
}

function addFieldOption(
  options: FieldOption[],
  seen: Set<string>,
  option: Omit<FieldOption, "id">,
) {
  const id = optionId(option.entityType, option.entityKey, option.fieldPath);
  if (seen.has(id)) return;
  seen.add(id);
  options.push({ ...option, id });
}

function collectLeafFieldOptions({
  record,
  entityType,
  entityKey,
  basePath,
  options,
  seen,
  maxArrayItems = 12,
}: {
  record: unknown;
  entityType: string;
  entityKey: string;
  basePath: string;
  options: FieldOption[];
  seen: Set<string>;
  maxArrayItems?: number;
}) {
  if (Array.isArray(record)) {
    record.slice(0, maxArrayItems).forEach((item, index) => {
      collectLeafFieldOptions({
        record: item,
        entityType,
        entityKey,
        basePath: `${basePath}[${index}]`,
        options,
        seen,
        maxArrayItems,
      });
    });
    return;
  }

  if (isRecord(record)) {
    Object.entries(record).forEach(([key, value]) => {
      if (key === "sourceText") return;
      collectLeafFieldOptions({
        record: value,
        entityType,
        entityKey,
        basePath: basePath ? `${basePath}.${key}` : key,
        options,
        seen,
        maxArrayItems,
      });
    });
    return;
  }

  addFieldOption(options, seen, {
    entityType,
    entityKey,
    fieldPath: basePath,
    label: humanizeKey(basePath.split(".").pop()?.replace(/\[\d+\]/g, "") || basePath),
    parsedValue: record,
  });
}

function addTemplateOptions({
  templates,
  record,
  entityType,
  entityKey,
  pathPrefix,
  options,
  seen,
}: {
  templates: string[][];
  record: JsonRecord;
  entityType: string;
  entityKey: string;
  pathPrefix?: string;
  options: FieldOption[];
  seen: Set<string>;
}) {
  templates.forEach(([fieldPath, label]) => {
    const fullPath = pathPrefix ? `${pathPrefix}.${fieldPath}` : fieldPath;
    const lookupPath = pathPrefix && fullPath.startsWith(`${pathPrefix}.`)
      ? fullPath.slice(pathPrefix.length + 1)
      : fullPath;
    addFieldOption(options, seen, {
      entityType,
      entityKey,
      fieldPath: fullPath,
      label,
      parsedValue: valueAtPath(record, lookupPath),
    });
  });
}

function buildFieldOptions(testCase: any, consumerInfo: JsonRecord, tradelines: JsonRecord[]): FieldOption[] {
  const options: FieldOption[] = [];
  const seen = new Set<string>();
  const parserContext = isRecord(testCase?.parserContext) ? testCase.parserContext : {};
  const parsed = isRecord(parserContext.parsed) ? parserContext.parsed : {};
  const reportMetadata = isRecord(parsed.reportMetadata) ? parsed.reportMetadata : {};

  [
    ["bureau", "Bureau", testCase?.bureau],
    ["parserMode", "Parser Mode", parserModeLabel(testCase?.parserMode)],
    ["allowAiFallback", "AI Fallback", testCase?.allowAiFallback === true ? "Allowed" : "Off"],
    ["stageVersion", "Stage Version", testCase?.stageVersion],
    ["extractionSource", "Extraction Source", testCase?.extractionSource],
  ].forEach(([fieldPath, label, parsedValue]) => {
    addFieldOption(options, seen, {
      entityType: "report",
      entityKey: "Report",
      fieldPath: String(fieldPath),
      label: String(label),
      parsedValue,
    });
  });

  collectLeafFieldOptions({
    record: reportMetadata,
    entityType: "report",
    entityKey: "Report",
    basePath: "reportMetadata",
    options,
    seen,
  });
  addTemplateOptions({
    templates: REPORT_FIELD_TEMPLATES,
    record: reportMetadata,
    entityType: "report",
    entityKey: "Report",
    options,
    seen,
  });

  collectLeafFieldOptions({
    record: consumerInfo,
    entityType: "consumerInfo",
    entityKey: "Consumer",
    basePath: "consumerInfo",
    options,
    seen,
  });
  addTemplateOptions({
    templates: CONSUMER_FIELD_TEMPLATES,
    record: consumerInfo,
    entityType: "consumerInfo",
    entityKey: "Consumer",
    pathPrefix: "consumerInfo",
    options,
    seen,
  });

  tradelines.forEach((tradeline, index) => {
    const entityKey =
      formatScalar(tradeline.creditorName) ||
      formatScalar(tradeline.accountNumber) ||
      `Tradeline ${index + 1}`;
    collectLeafFieldOptions({
      record: tradeline,
      entityType: "tradeline",
      entityKey,
      basePath: `tradelines[${index}]`,
      options,
      seen,
    });
    addTemplateOptions({
      templates: TRADELINE_FIELD_TEMPLATES,
      record: tradeline,
      entityType: "tradeline",
      entityKey,
      pathPrefix: `tradelines[${index}]`,
      options,
      seen,
    });
  });

  [
    ["inquiries", "inquiry", "Inquiry"],
    ["employmentInfo", "employment", "Employment"],
    ["publicRecords", "publicRecord", "Public Record"],
    ["creditScores", "score", "Score"],
  ].forEach(([sectionKey, entityType, entityLabel]) => {
    const rows = parsed[sectionKey];
    if (!Array.isArray(rows)) return;
    rows.filter(isRecord).forEach((row, index) => {
      const entityKey =
        formatScalar(row.creditorName) ||
        formatScalar(row.companyName) ||
        formatScalar(row.name) ||
        `${entityLabel} ${index + 1}`;
      collectLeafFieldOptions({
        record: row,
        entityType,
        entityKey,
        basePath: `${sectionKey}[${index}]`,
        options,
        seen,
      });
    });
  });

  return options.sort((left, right) =>
    `${left.entityType}-${left.entityKey}-${left.fieldPath}`.localeCompare(
      `${right.entityType}-${right.entityKey}-${right.fieldPath}`,
    )
  );
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

function coerceCorrectValue(value: string, parsedValue: unknown, fieldPath: string): unknown {
  if (typeof parsedValue === "number") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : value;
  }

  if (typeof parsedValue === "boolean") {
    return ["true", "yes", "allowed", "1"].includes(value.trim().toLowerCase());
  }

  if (/(balance|payment|pastDue|highCredit|creditLimit|amounts\.high|amounts\.limit|amounts\.pastDue)$/i.test(fieldPath)) {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : value;
  }

  return value;
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
  const approvedConsumerInfo =
    isRecord(testCase?.approvedConsumerInfo) && Object.keys(testCase.approvedConsumerInfo).length > 0
      ? testCase.approvedConsumerInfo
      : null;
  const approvedTradelines = Array.isArray(testCase?.approvedTradelines) && testCase.approvedTradelines.length > 0
    ? testCase.approvedTradelines.filter(isRecord)
    : null;
  const displayConsumerInfo = approvedConsumerInfo ?? consumerInfo;
  const displayTradelines = approvedTradelines ?? tradelines;
  const hasApprovedValues = approvedConsumerInfo !== null || approvedTradelines !== null;
  const decisions = Array.isArray(testCase?.adjudicationDecisions)
    ? testCase.adjudicationDecisions.filter(isRecord)
    : [];
  const rawText = typeof testCase?.rawExtractedText === "string" ? testCase.rawExtractedText : "";
  const [decisionDraft, setDecisionDraft] = React.useState<DecisionDraft>(EMPTY_DECISION_DRAFT);
  const fieldOptions = React.useMemo(
    () => buildFieldOptions(testCase, consumerInfo, tradelines),
    [testCase, consumerInfo, tradelines],
  );
  const entityOptions = React.useMemo(
    () => Array.from(new Set(fieldOptions.map((option) => option.entityType))),
    [fieldOptions],
  );
  const entityKeyOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          fieldOptions
            .filter((option) => option.entityType === decisionDraft.entityType)
            .map((option) => option.entityKey),
        ),
      ),
    [fieldOptions, decisionDraft.entityType],
  );
  const visibleFieldOptions = React.useMemo(
    () =>
      fieldOptions.filter(
        (option) =>
          option.entityType === decisionDraft.entityType &&
          option.entityKey === decisionDraft.entityKey,
      ),
    [fieldOptions, decisionDraft.entityType, decisionDraft.entityKey],
  );
  const hasSavedOutput =
    Object.keys(consumerInfo).length > 0 || tradelines.length > 0 || rawText.trim().length > 0;
  const selectedFieldOption = fieldOptions.find((option) => option.id === decisionDraft.selectedFieldId);

  const setDraftValue = (key: keyof DecisionDraft, value: string) => {
    setDecisionDraft((current) => ({ ...current, [key]: value }));
  };

  const applyFieldOption = (option: FieldOption | undefined) => {
    if (!option) return;
    const parsedValue = summarizeValue(option.parsedValue);
    setDecisionDraft((current) => ({
      ...current,
      selectedFieldId: option.id,
      entityType: option.entityType,
      entityKey: option.entityKey,
      fieldPath: option.fieldPath,
      parsedValue,
      correctValue: current.decision === "not_reported" ? "" : parsedValue,
    }));
  };

  const handleEntityChange = (entityType: string) => {
    const nextOption = fieldOptions.find((option) => option.entityType === entityType);
    if (nextOption) {
      applyFieldOption(nextOption);
      return;
    }
    setDecisionDraft((current) => ({
      ...current,
      entityType,
      entityKey: "",
      selectedFieldId: "",
      fieldPath: "",
      parsedValue: "",
    }));
  };

  const handleEntityKeyChange = (entityKey: string) => {
    const nextOption = fieldOptions.find(
      (option) => option.entityType === decisionDraft.entityType && option.entityKey === entityKey,
    );
    if (nextOption) {
      applyFieldOption(nextOption);
      return;
    }
    setDecisionDraft((current) => ({
      ...current,
      entityKey,
      selectedFieldId: "",
      fieldPath: "",
      parsedValue: "",
    }));
  };

  const handleFieldChange = (fieldId: string) => {
    applyFieldOption(fieldOptions.find((option) => option.id === fieldId));
  };

  React.useEffect(() => {
    if (decisionDraft.selectedFieldId || fieldOptions.length === 0) return;
    const firstTradeline = fieldOptions.find((option) => option.entityType === "tradeline");
    applyFieldOption(firstTradeline ?? fieldOptions[0]);
  }, [decisionDraft.selectedFieldId, fieldOptions]);

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
    const rawParsedValue = selectedFieldOption?.parsedValue ?? decisionDraft.parsedValue;
    const parsedValueForSubmission = rawParsedValue === "" ? undefined : rawParsedValue;

    await onAdjudicate({
      testCaseId: testCase.id,
      adminReviewStatus:
        decisionDraft.decision === "accepted" ? "partially_reviewed" : "needs_parser_rule",
      decision: {
        entityType: decisionDraft.entityType,
        entityKey: decisionDraft.entityKey || undefined,
        fieldPath: decisionDraft.fieldPath,
        decision: decisionDraft.decision,
        parsedValue: parsedValueForSubmission,
        correctValue:
          decisionDraft.decision === "not_reported"
            ? null
            : decisionDraft.decision === "accepted"
              ? parsedValueForSubmission
              : coerceCorrectValue(
                  decisionDraft.correctValue || decisionDraft.parsedValue,
                  selectedFieldOption?.parsedValue,
                  decisionDraft.fieldPath,
                ),
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
                onChange={(event) => handleEntityChange(event.target.value)}
              >
                {entityOptions.map((entityType) => (
                  <option key={entityType} value={entityType}>
                    {ENTITY_LABELS[entityType] ?? humanizeKey(entityType)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Account / Section</span>
              <select
                value={decisionDraft.entityKey}
                onChange={(event) => handleEntityKeyChange(event.target.value)}
              >
                {entityKeyOptions.map((entityKey) => (
                  <option key={entityKey} value={entityKey}>
                    {entityKey}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fullWidth}>
              <span>Field to Review</span>
              <select
                value={decisionDraft.selectedFieldId}
                onChange={(event) => handleFieldChange(event.target.value)}
              >
                {visibleFieldOptions.map((option) => {
                  const parsedValue = summarizeValue(option.parsedValue);
                  return (
                    <option key={option.id} value={option.id}>
                      {option.label} - {option.fieldPath}
                      {parsedValue ? ` (${truncate(parsedValue, 60)})` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>Decision</span>
              <select
                value={decisionDraft.decision}
                onChange={(event) => {
                  const nextDecision = event.target.value;
                  setDecisionDraft((current) => ({
                    ...current,
                    decision: nextDecision,
                    correctValue:
                      nextDecision === "accepted" ? current.parsedValue : current.correctValue,
                  }));
                }}
              >
                <option value="corrected">Corrected</option>
                <option value="missing">Missing From Parser</option>
                <option value="not_reported">Not Reported By Bureau</option>
                <option value="accepted">Accepted Field</option>
                <option value="ignored">Ignore</option>
              </select>
            </label>
            <label>
              <span>Corrected / Approved Value</span>
              <Input
                value={decisionDraft.correctValue}
                onChange={(event) => setDraftValue("correctValue", event.target.value)}
                placeholder="Edit this to the value shown on the bureau report"
              />
            </label>
            <div className={styles.parsedValuePreview}>
              <span>Current Parsed Value</span>
              <strong>{decisionDraft.parsedValue || "Blank / not parsed"}</strong>
              <small>{decisionDraft.fieldPath || "Select a field"}</small>
            </div>
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
                <div className={styles.decisionValues}>
                  <div>
                    <span>Parsed</span>
                    <strong>{truncate(summarizeValue(decision.parsedValue) || "Blank / not parsed")}</strong>
                  </div>
                  <div>
                    <span>Approved</span>
                    <strong>{truncate(summarizeValue(decision.correctValue) || "Blank / not reported")}</strong>
                  </div>
                </div>
                <span className={styles.mutedText}>
                  {formatScalar(decision.entityType)} {formatScalar(decision.entityKey)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          {hasApprovedValues ? "Approved Consumer Information" : "Consumer Information"}
        </h4>
        <ObjectTable record={displayConsumerInfo} />
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          {hasApprovedValues ? "Approved Tradelines" : "Saved Tradelines"}
        </h4>
        <div className={styles.tradelineList}>
          {displayTradelines.length > 0 ? (
            displayTradelines.map((tradeline, index) => (
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
