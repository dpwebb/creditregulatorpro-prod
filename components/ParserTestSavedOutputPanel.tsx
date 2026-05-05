import React from "react";
import { ChevronDown, ChevronRight, Database } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "./Badge";
import styles from "./ParserTestSavedOutputPanel.module.css";

interface ParserTestSavedOutputPanelProps {
  testCase: any;
  emptyIcon?: React.ReactNode;
}

type JsonRecord = Record<string, unknown>;

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

export function ParserTestSavedOutputPanel({ testCase, emptyIcon }: ParserTestSavedOutputPanelProps) {
  const consumerInfo = isRecord(testCase?.expectedConsumerInfo) ? testCase.expectedConsumerInfo : {};
  const tradelines = Array.isArray(testCase?.expectedTradelines)
    ? testCase.expectedTradelines.filter(isRecord)
    : [];
  const rawText = typeof testCase?.rawExtractedText === "string" ? testCase.rawExtractedText : "";
  const hasSavedOutput =
    Object.keys(consumerInfo).length > 0 || tradelines.length > 0 || rawText.trim().length > 0;

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
        <Badge variant="info">Baseline</Badge>
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
