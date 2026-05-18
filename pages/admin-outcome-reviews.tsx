import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  AlertTriangle,
  Archive,
  Check,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { format } from "../helpers/dateUtils";
import {
  FindingOutcomeTypeArrayValues,
  OutcomeComparisonStatusArrayValues,
  type FindingOutcomeType,
  type OutcomeAdminReviewAction,
  type OutcomeComparisonStatus,
} from "../helpers/schema";
import {
  useOutcomeAdminReviewMutation,
  useOutcomeRun,
  useOutcomeRuns,
  type OutcomeListInput,
} from "../helpers/outcomeQueries";
import type { OutputType as OutcomeGetOutput } from "../endpoints/outcomes/get_GET.schema";
import type { OutputType as OutcomeListOutput } from "../endpoints/outcomes/list_GET.schema";
import styles from "./admin-outcome-reviews.module.css";

type OutcomeRun = OutcomeListOutput["runs"][number];
type OutcomeRunDetail = OutcomeGetOutput["comparisonRun"];
type FindingOutcome = OutcomeRunDetail["findingOutcomes"][number];

type FilterState = {
  packetId: string;
  previousReportArtifactId: string;
  laterReportArtifactId: string;
  outcomeType: string;
  status: string;
  startDate: string;
  endDate: string;
  limit: string;
  offset: string;
};

const EMPTY_FILTERS: FilterState = {
  packetId: "",
  previousReportArtifactId: "",
  laterReportArtifactId: "",
  outcomeType: "",
  status: "",
  startDate: "",
  endDate: "",
  limit: "50",
  offset: "0",
};

const SUMMARY_FIELDS = [
  ["corrected", "Appears corrected"],
  ["removed", "Appears removed"],
  ["unchanged", "Appears unchanged"],
  ["reinserted", "Reinserted"],
  ["partiallyCorrected", "Partially corrected"],
  ["newIssue", "New issue"],
  ["unresolved", "Unresolved"],
  ["needsReview", "Needs review"],
  ["notComparable", "Not comparable"],
  ["responseReceived", "Response recorded"],
] as const;

const REVIEW_ACTIONS: Array<{
  action: OutcomeAdminReviewAction;
  label: string;
  variant?: "primary" | "secondary" | "outline" | "destructive";
}> = [
  { action: "review_outcome", label: "Review Outcome", variant: "secondary" },
  { action: "mark_needs_review", label: "Mark Needs Review", variant: "outline" },
  { action: "confirm_outcome", label: "Confirm for Admin Review", variant: "primary" },
  { action: "reject_match", label: "Reject Match for Review Purposes", variant: "outline" },
  { action: "reject_classification", label: "Reject Classification for Review Purposes", variant: "outline" },
  { action: "archive_review", label: "Archive Review", variant: "destructive" },
];

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|full.?account|member.?number|raw.?text|raw.?extracted|extracted.?text|pdf.?text|report.?text|packet.?body|storage.?url|signed.?url|token|api.?key|private.?key|database.?url|cookie|session)/i;
const ACCOUNT_NUMBER_KEY_PATTERN = /(^|[^a-z])account.?number([^a-z]|$)/i;
const SAFE_ACCOUNT_KEY_PATTERN = /(masked.?account|account.?suffix)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{10,}\b/g;
const REVIEW_NOTE_ACCOUNT_PATTERN = /\b\d{10,}\b/;
const REVIEW_NOTE_FORBIDDEN_PATTERN =
  /(raw report text|raw pdf text|packet body|violated the law|legal violation|confirmed legal violation|admitted fault|entitled to damages|must pay|you won)/i;

function formatEnum(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

function formatDate(value: Date | string | null | undefined): string {
  return value ? format(value, "MMM d, yyyy h:mm a") : "-";
}

function cleanInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function outcomeVariant(value: string) {
  if (["corrected", "removed"].includes(value)) return "success";
  if (["needs_review", "unresolved", "partially_corrected", "response_received"].includes(value)) return "warning";
  if (["not_comparable", "new_issue", "reinserted"].includes(value)) return "info";
  return "default";
}

function reviewVariant(value: string | null | undefined) {
  if (value === "confirmed" || value === "reviewed") return "success";
  if (value === "needs_review" || value === "rejected_match" || value === "rejected_classification") return "warning";
  if (value === "archived") return "default";
  return "info";
}

function sanitizeDisplayValue(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) return value;

  const key = parentKey ?? "";
  const isAccountNumberKey = ACCOUNT_NUMBER_KEY_PATTERN.test(key);
  const isSafeAccountKey = SAFE_ACCOUNT_KEY_PATTERN.test(key);
  if (SENSITIVE_KEY_PATTERN.test(key) || (isAccountNumberKey && !isSafeAccountKey)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item, key));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const unsafeKey =
        SENSITIVE_KEY_PATTERN.test(nestedKey) ||
        (ACCOUNT_NUMBER_KEY_PATTERN.test(nestedKey) && !SAFE_ACCOUNT_KEY_PATTERN.test(nestedKey));
      output[nestedKey] = unsafeKey ? "[redacted]" : sanitizeDisplayValue(nestedValue, nestedKey);
    }
    return output;
  }

  if (typeof value === "string") {
    return value
      .replace(SIN_PATTERN, "[redacted SIN]")
      .replace(ACCOUNT_PHRASE_PATTERN, "[redacted account]")
      .replace(LONG_NUMBER_PATTERN, (match) => `...${match.slice(-4)}`);
  }

  return value;
}

function validateReviewNotes(notes: string): string | null {
  if (SIN_PATTERN.test(notes)) return "Review notes must not include full SIN-like values.";
  SIN_PATTERN.lastIndex = 0;
  if (REVIEW_NOTE_ACCOUNT_PATTERN.test(notes)) return "Review notes must not include full account-like numbers.";
  if (REVIEW_NOTE_FORBIDDEN_PATTERN.test(notes)) {
    return "Review notes must stay neutral and must not include raw text markers or legal conclusions.";
  }
  return null;
}

function filtersToInput(filters: FilterState): OutcomeListInput {
  return {
    packetId: cleanInteger(filters.packetId),
    previousReportArtifactId: cleanInteger(filters.previousReportArtifactId),
    laterReportArtifactId: cleanInteger(filters.laterReportArtifactId),
    outcomeType: (filters.outcomeType || undefined) as FindingOutcomeType | undefined,
    status: (filters.status || undefined) as OutcomeComparisonStatus | undefined,
    startDate: cleanDate(filters.startDate),
    endDate: cleanDate(filters.endDate),
    limit: cleanInteger(filters.limit) ?? 50,
    offset: cleanInteger(filters.offset) ?? 0,
  };
}

function SummaryCounts({ summary }: { summary: OutcomeRun["summary"] }) {
  return (
    <div className={styles.summaryGrid}>
      {SUMMARY_FIELDS.map(([key, label]) => (
        <div key={key} className={styles.summaryItem}>
          <span>{label}</span>
          <strong>{summary?.[key] ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function SnapshotBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div className={styles.snapshotBlock}>
        <strong>{label}</strong>
        <p>No safe snapshot data available.</p>
      </div>
    );
  }

  return (
    <div className={styles.snapshotBlock}>
      <strong>{label}</strong>
      <pre>{JSON.stringify(sanitizeDisplayValue(value), null, 2)}</pre>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className={styles.detailRow}>
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "-" : String(value)}</strong>
    </div>
  );
}

function SafetyBanner() {
  return (
    <div className={styles.safetyBanner}>
      <ShieldCheck size={18} />
      <div>
        <strong>Admin review changes review metadata only.</strong>
        <span>
          Deterministic outcome fields are preserved. This does not change canonical report facts, packet readiness, packet wording, or regulation runtime truth. Response documents remain evidence only and are not canonical credit-report facts.
        </span>
      </div>
    </div>
  );
}

function PreservationNotice() {
  return (
    <div className={styles.preservationNotice}>
      <ShieldCheck size={18} />
      <span>
        Admin review does not rewrite outcomeType, matchingMethod, confidenceLevel, reason codes, snapshots, or source records.
      </span>
    </div>
  );
}

function FindingReviewControls({
  comparisonRunId,
  finding,
}: {
  comparisonRunId: number;
  finding: FindingOutcome;
}) {
  const reviewMutation = useOutcomeAdminReviewMutation();
  const [notes, setNotes] = useState("");
  const [canonicalConfirmed, setCanonicalConfirmed] = useState(false);
  const [runtimeConfirmed, setRuntimeConfirmed] = useState(false);
  const [preservationConfirmed, setPreservationConfirmed] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submitReview = async (reviewAction: OutcomeAdminReviewAction) => {
    const trimmedNotes = notes.trim();
    const notesRequired = reviewAction !== "review_outcome" && !(reviewAction === "archive_review" && archiveConfirmed);
    if (notesRequired && !trimmedNotes) {
      setActionError("This review action requires review notes.");
      return;
    }

    const noteError = validateReviewNotes(trimmedNotes);
    if (noteError) {
      setActionError(noteError);
      return;
    }

    if (["confirm_outcome", "reject_match", "reject_classification"].includes(reviewAction)) {
      if (!canonicalConfirmed) {
        setActionError("Confirm that this action does not change canonical facts.");
        return;
      }
      if (!runtimeConfirmed) {
        setActionError("Confirm that this action does not activate regulation runtime truth.");
        return;
      }
      if (!preservationConfirmed) {
        setActionError("Confirm that deterministic outcome fields are preserved.");
        return;
      }
    }

    if (reviewAction === "archive_review" && !trimmedNotes && !archiveConfirmed) {
      setActionError("Archive review requires notes or explicit confirmation.");
      return;
    }

    setActionError(null);
    await reviewMutation.mutateAsync({
      comparisonRunId,
      findingOutcomeId: finding.id,
      reviewAction,
      reviewNotes: trimmedNotes || null,
      confirmNoCanonicalChange: canonicalConfirmed,
      confirmNoRuntimeActivation: runtimeConfirmed,
      confirmNoPacketMutation: preservationConfirmed,
      explicitConfirmation: archiveConfirmed,
    });
  };

  return (
    <div className={styles.reviewControls}>
      <label className={styles.fieldLabel} htmlFor={`review-notes-${finding.id}`}>
        Review notes
      </label>
      <textarea
        id={`review-notes-${finding.id}`}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className={styles.textarea}
        rows={3}
        placeholder="Add neutral admin review notes."
      />

      <div className={styles.checkboxGrid}>
        <label>
          <input
            type="checkbox"
            checked={canonicalConfirmed}
            onChange={(event) => setCanonicalConfirmed(event.target.checked)}
          />
          I understand this does not change canonical facts.
        </label>
        <label>
          <input
            type="checkbox"
            checked={runtimeConfirmed}
            onChange={(event) => setRuntimeConfirmed(event.target.checked)}
          />
          I understand this does not activate regulation runtime truth.
        </label>
        <label>
          <input
            type="checkbox"
            checked={preservationConfirmed}
            onChange={(event) => setPreservationConfirmed(event.target.checked)}
          />
          I understand deterministic outcome fields are preserved.
        </label>
        <label>
          <input
            type="checkbox"
            checked={archiveConfirmed}
            onChange={(event) => setArchiveConfirmed(event.target.checked)}
          />
          I explicitly confirm archive review.
        </label>
      </div>

      {actionError && (
        <div className={styles.actionError} role="alert">
          <AlertTriangle size={16} />
          {actionError}
        </div>
      )}

      <div className={styles.reviewButtonGrid}>
        {REVIEW_ACTIONS.map((action) => (
          <Button
            key={action.action}
            variant={action.variant ?? "secondary"}
            size="sm"
            disabled={reviewMutation.isPending}
            onClick={() => submitReview(action.action)}
          >
            {action.action === "review_outcome" && <Check size={14} />}
            {action.action === "archive_review" && <Archive size={14} />}
            {action.action.startsWith("reject") && <X size={14} />}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function FindingOutcomeCard({
  comparisonRunId,
  finding,
}: {
  comparisonRunId: number;
  finding: FindingOutcome;
}) {
  const reasonCodes = stringArray(finding.outcomeReasonCodes);
  const evidenceIds = stringArray(finding.evidenceIds);

  return (
    <section className={styles.findingCard}>
      <div className={styles.findingHeader}>
        <div>
          <span className={styles.kicker}>Finding outcome #{finding.id}</span>
          <h3>{formatEnum(finding.outcomeType)}</h3>
        </div>
        <div className={styles.badgeRow}>
          <Badge variant={outcomeVariant(finding.outcomeType)}>{formatEnum(finding.outcomeType)}</Badge>
          <Badge variant={reviewVariant(finding.adminReviewStatus)}>{formatEnum(finding.adminReviewStatus)}</Badge>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Confidence" value={formatEnum(finding.confidenceLevel)} />
        <DetailRow label="Matching method" value={formatEnum(finding.matchingMethod)} />
        <DetailRow label="Previous tradeline" value={finding.previousTradelineId} />
        <DetailRow label="Later tradeline" value={finding.laterTradelineId} />
        <DetailRow label="Creditor obligation test" value={finding.creditorObligationTestId} />
        <DetailRow label="Dispute packet finding" value={finding.disputePacketFindingId} />
        <DetailRow label="Reviewed by" value={finding.reviewedBy} />
        <DetailRow label="Reviewed at" value={formatDate(finding.reviewedAt)} />
      </div>

      <div className={styles.reasonBlock}>
        <strong>Reason codes</strong>
        <div className={styles.reasonList}>
          {reasonCodes.length > 0
            ? reasonCodes.map((reason) => <Badge key={reason} variant="info">{formatEnum(reason)}</Badge>)
            : <span>-</span>}
        </div>
      </div>

      <div className={styles.reasonBlock}>
        <strong>Evidence IDs</strong>
        <div className={styles.reasonList}>
          {evidenceIds.length > 0
            ? evidenceIds.map((evidenceId) => <Badge key={evidenceId} variant="default">{evidenceId}</Badge>)
            : <span>-</span>}
        </div>
      </div>

      <div className={styles.snapshotGrid}>
        <SnapshotBlock label="Previous safe snapshot" value={finding.previousSnapshot} />
        <SnapshotBlock label="Later safe snapshot" value={finding.laterSnapshot} />
        <SnapshotBlock label="Evidence location" value={finding.evidenceLocationSnapshot} />
      </div>

      <PreservationNotice />
      <FindingReviewControls comparisonRunId={comparisonRunId} finding={finding} />
    </section>
  );
}

function OutcomeRunCard({
  run,
  selected,
  onSelect,
}: {
  run: OutcomeRun;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const warnings = Array.isArray(run.warnings) ? run.warnings : [];

  return (
    <article className={`${styles.runCard} ${selected ? styles.selectedRun : ""}`}>
      <div className={styles.runHeader}>
        <div>
          <span className={styles.kicker}>Comparison run #{run.id}</span>
          <h2>{formatEnum(run.comparisonScope)}</h2>
        </div>
        <div className={styles.badgeRow}>
          <Badge variant={run.status === "completed" ? "success" : run.status === "needs_review" ? "warning" : "default"}>
            {formatEnum(run.status)}
          </Badge>
          <Badge variant={reviewVariant(run.adminReviewStatus)}>{formatEnum(run.adminReviewStatus)}</Badge>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Created" value={formatDate(run.createdAt)} />
        <DetailRow label="Previous report" value={run.previousReportArtifactId} />
        <DetailRow label="Later report" value={run.laterReportArtifactId} />
        <DetailRow label="Packet" value={run.packetId} />
        <DetailRow label="Warnings" value={warnings.length} />
      </div>

      <SummaryCounts summary={run.summary} />

      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" onClick={() => onSelect(run.id)}>
          <Eye size={16} />
          View Details
        </Button>
      </div>
    </article>
  );
}

export default function AdminOutcomeReviewsPage() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const listFilters = useMemo(() => filtersToInput(filters), [filters]);
  const runsQuery = useOutcomeRuns(listFilters);
  const detailQuery = useOutcomeRun(selectedRunId);

  const runs = runsQuery.data?.runs ?? [];
  const selectedRun = detailQuery.data?.comparisonRun ?? null;
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => key !== "limit" && key !== "offset" && value.trim());

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value, ...(key !== "offset" ? { offset: "0" } : {}) }));
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Outcome Reviews | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Outcome Reviews"
        subtitle="Admin-only review of deterministic outcome comparison runs and finding outcomes."
      >
        <Button variant="secondary" onClick={() => runsQuery.refetch()} disabled={runsQuery.isFetching}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </PageHeader>

      <SafetyBanner />

      <section className={styles.toolbar} aria-label="Outcome review filters">
        <div className={styles.toolbarHeader}>
          <Filter size={18} />
          <strong>Filters</strong>
        </div>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span>Packet ID</span>
            <input value={filters.packetId} onChange={(event) => updateFilter("packetId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Previous report ID</span>
            <input value={filters.previousReportArtifactId} onChange={(event) => updateFilter("previousReportArtifactId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Later report ID</span>
            <input value={filters.laterReportArtifactId} onChange={(event) => updateFilter("laterReportArtifactId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Outcome type</span>
            <select value={filters.outcomeType} onChange={(event) => updateFilter("outcomeType", event.target.value)}>
              <option value="">All outcome types</option>
              {FindingOutcomeTypeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Status</span>
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">All statuses</option>
              {OutcomeComparisonStatusArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Start date</span>
            <input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>End date</span>
            <input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Limit</span>
            <input value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Offset</span>
            <input value={filters.offset} onChange={(event) => updateFilter("offset", event.target.value)} />
          </label>
        </div>
        <div className={styles.filterActions}>
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear Filters
          </Button>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.listPanel}>
          <div className={styles.sectionHeader}>
            <Search size={18} />
            <div>
              <h2>Comparison Runs</h2>
              <p>{runsQuery.data?.total ?? 0} run{runsQuery.data?.total === 1 ? "" : "s"} found.</p>
            </div>
          </div>

          {runsQuery.isLoading ? (
            <div className={styles.stack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className={styles.runSkeleton} />
              ))}
            </div>
          ) : runsQuery.isError ? (
            <div className={styles.stateBox} role="alert">
              <AlertTriangle size={24} />
              <h3>Unable to load outcome runs</h3>
              <p>{runsQuery.error instanceof Error ? runsQuery.error.message : "Try refreshing the page."}</p>
            </div>
          ) : runs.length === 0 ? (
            <div className={styles.stateBox}>
              <Search size={24} />
              <h3>{hasActiveFilters ? "No matching outcome runs" : "No outcome runs yet"}</h3>
              <p>{hasActiveFilters ? "Adjust filters to broaden the result set." : "Persisted outcome comparison runs will appear here after backend comparisons run."}</p>
            </div>
          ) : (
            <div className={styles.stack}>
              {runs.map((run) => (
                <OutcomeRunCard
                  key={run.id}
                  run={run}
                  selected={run.id === selectedRunId}
                  onSelect={setSelectedRunId}
                />
              ))}
            </div>
          )}
        </section>

        <section className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <ShieldCheck size={18} />
            <div>
              <h2>Run Detail</h2>
              <p>Review deterministic outcomes without changing source truth.</p>
            </div>
          </div>

          {!selectedRunId ? (
            <div className={styles.stateBox}>
              <Eye size={24} />
              <h3>Select an outcome run</h3>
              <p>Open a run to inspect finding outcomes, safe snapshots, and review metadata.</p>
            </div>
          ) : detailQuery.isLoading ? (
            <Skeleton className={styles.detailSkeleton} />
          ) : detailQuery.isError ? (
            <div className={styles.stateBox} role="alert">
              <AlertTriangle size={24} />
              <h3>Unable to load outcome run</h3>
              <p>{detailQuery.error instanceof Error ? detailQuery.error.message : "Try selecting the run again."}</p>
            </div>
          ) : selectedRun ? (
            <div className={styles.detailContent}>
              <div className={styles.runDetailHeader}>
                <div>
                  <span className={styles.kicker}>Comparison run #{selectedRun.id}</span>
                  <h2>{formatEnum(selectedRun.comparisonScope)}</h2>
                </div>
                <div className={styles.badgeRow}>
                  <Badge variant={selectedRun.status === "completed" ? "success" : "default"}>{formatEnum(selectedRun.status)}</Badge>
                  <Badge variant={reviewVariant(selectedRun.adminReviewStatus)}>{formatEnum(selectedRun.adminReviewStatus)}</Badge>
                </div>
              </div>

              <div className={styles.detailGrid}>
                <DetailRow label="Created" value={formatDate(selectedRun.createdAt)} />
                <DetailRow label="Previous report" value={selectedRun.previousReportArtifactId} />
                <DetailRow label="Later report" value={selectedRun.laterReportArtifactId} />
                <DetailRow label="Packet" value={selectedRun.packetId} />
                <DetailRow label="Reviewed by" value={selectedRun.reviewedBy} />
                <DetailRow label="Reviewed at" value={formatDate(selectedRun.reviewedAt)} />
              </div>

              <SummaryCounts summary={selectedRun.summary} />
              <PreservationNotice />

              {Array.isArray(selectedRun.warnings) && selectedRun.warnings.length > 0 && (
                <div className={styles.warningBox}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Warnings</strong>
                    <pre>{JSON.stringify(sanitizeDisplayValue(selectedRun.warnings), null, 2)}</pre>
                  </div>
                </div>
              )}

              <div className={styles.findingStack}>
                {selectedRun.findingOutcomes.map((finding) => (
                  <FindingOutcomeCard key={finding.id} comparisonRunId={selectedRun.id} finding={finding} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
