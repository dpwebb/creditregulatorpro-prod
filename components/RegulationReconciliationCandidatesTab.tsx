import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Filter, Search, ShieldCheck } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { format } from "../helpers/dateUtils";
import {
  RegulationReconciliationCandidateReviewStatusArrayValues,
  RegulationReconciliationCandidateSeverityArrayValues,
  RegulationReconciliationCandidateTypeArrayValues,
  type RegulationReconciliationCandidateReviewStatus,
} from "../helpers/schema";
import {
  useRegulationReconciliationCandidates,
  useUpdateRegulationReconciliationCandidateStatus,
} from "../helpers/useRegulationRegistry";
import styles from "../pages/regulatory-updates.module.css";

type ReconciliationCandidateRow = {
  id: number;
  candidateType: string;
  sourceFindingType?: string | null;
  staticReferenceId?: string | null;
  dbRegulationId?: string | null;
  dbMappingId?: number | null;
  deterministicRuleId?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  mismatchSummary: string;
  sourceUrl?: string | null;
  citation?: string | null;
  effectiveDate?: Date | string | null;
  staticSnapshotHash?: string | null;
  dbSnapshotHash?: string | null;
  reconciliationRunId?: string | null;
  mismatchHash?: string | null;
  severity: string;
  reviewStatus: string;
  activeStatus: string;
  createdAt?: Date | string | null;
  reviewedAt?: Date | string | null;
  reviewNotes?: string | null;
  rejectedReason?: string | null;
  oldValue?: unknown;
  proposedValue?: unknown;
};

type CandidateFilters = {
  candidateType: string;
  severity: string;
  reviewStatus: string;
  staticReferenceId: string;
  dbRegulationId: string;
  deterministicRuleId: string;
  reconciliationRunId: string;
};

const EMPTY_FILTERS: CandidateFilters = {
  candidateType: "",
  severity: "",
  reviewStatus: "",
  staticReferenceId: "",
  dbRegulationId: "",
  deterministicRuleId: "",
  reconciliationRunId: "",
};

const APPROVAL_REVIEW_STATUSES = new Set<RegulationReconciliationCandidateReviewStatus>([
  "approved_for_mapping_review",
  "approved_for_registry_update",
]);

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|full.?account|member.?number|packet|raw.?text|raw.?extracted|extracted.?text|credit.?report|source.?text|consumer.?personal|dob|date.?of.?birth)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{9,}\b/g;

function formatEnum(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDate(value: Date | string | null | undefined): string {
  return value ? format(value, "MMM d, yyyy") : "-";
}

function variantForSeverity(severity: string) {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "info";
}

function variantForStatus(status: string) {
  if (status === "rejected" || status === "archived" || status === "superseded") return "default";
  if (status.startsWith("approved_for")) return "success";
  if (status === "pending_review" || status.startsWith("needs_")) return "warning";
  return "info";
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeDisplayValue(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) return value;

  if (parentKey && SENSITIVE_KEY_PATTERN.test(parentKey)) return "[redacted]";

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item, parentKey));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = sanitizeDisplayValue(nestedValue, key);
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

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) {
    return (
      <div className={styles.snapshotBlock}>
        <strong>{label}</strong>
        <p className={styles.description}>No snapshot data available.</p>
      </div>
    );
  }

  return (
    <div className={styles.snapshotBlock}>
      <strong>{label}</strong>
      <pre className={styles.jsonBlock}>{JSON.stringify(sanitizeDisplayValue(value), null, 2)}</pre>
    </div>
  );
}

function getRecommendedAction(candidate: ReconciliationCandidateRow): string {
  const proposed = candidate.proposedValue;
  if (proposed && typeof proposed === "object" && "recommendedAction" in proposed) {
    const value = (proposed as { recommendedAction?: unknown }).recommendedAction;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Review the mismatch and choose a review-only status.";
}

export function RegulationReconciliationCandidatesTab() {
  const [filters, setFilters] = useState<CandidateFilters>(EMPTY_FILTERS);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const listFilters = useMemo(
    () => ({
      candidateType: clean(filters.candidateType) as any,
      severity: clean(filters.severity) as any,
      reviewStatus: clean(filters.reviewStatus) as any,
      staticReferenceId: clean(filters.staticReferenceId),
      dbRegulationId: clean(filters.dbRegulationId),
      deterministicRuleId: clean(filters.deterministicRuleId),
      reconciliationRunId: clean(filters.reconciliationRunId),
    }),
    [filters],
  );

  const snapshotFilters = useMemo(
    () => ({
      ...listFilters,
      includeSnapshotData: true,
    }),
    [listFilters],
  );

  const listQuery = useRegulationReconciliationCandidates(listFilters);
  const detailQuery = useRegulationReconciliationCandidates(snapshotFilters, {
    enabled: selectedCandidateId !== null,
  });
  const updateStatus = useUpdateRegulationReconciliationCandidateStatus();

  const candidates = (listQuery.data?.candidates ?? []) as ReconciliationCandidateRow[];
  const snapshotCandidates = (detailQuery.data?.candidates ?? []) as ReconciliationCandidateRow[];
  const selectedCandidate =
    snapshotCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    null;
  const hasActiveFilters = Object.values(filters).some((value) => value.trim().length > 0);
  const selectedCandidateIsInert = selectedCandidate?.activeStatus === "inert";

  const updateFilter = <K extends keyof CandidateFilters>(key: K, value: CandidateFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const selectCandidate = (candidate: ReconciliationCandidateRow) => {
    setSelectedCandidateId(candidate.id);
    setReviewNotes(candidate.reviewNotes ?? "");
    setRejectedReason(candidate.rejectedReason ?? "");
    setApprovalConfirmed(false);
    setActionError(null);
  };

  const submitStatus = async (reviewStatus: RegulationReconciliationCandidateReviewStatus) => {
    if (!selectedCandidate) return;
    if (!selectedCandidateIsInert) {
      setActionError("This candidate is not inert. Review actions are disabled.");
      return;
    }
    if (APPROVAL_REVIEW_STATUSES.has(reviewStatus)) {
      if (!reviewNotes.trim()) {
        setActionError("Approval-for-review actions require review notes.");
        return;
      }
      if (!approvalConfirmed) {
        setActionError("Confirm that this action does not activate runtime regulation truth.");
        return;
      }
    }
    if (reviewStatus === "rejected" && !rejectedReason.trim()) {
      setActionError("Rejected reconciliation candidates require a rejected reason.");
      return;
    }

    setActionError(null);
    await updateStatus.mutateAsync({
      candidateId: selectedCandidate.id,
      reviewStatus,
      reviewNotes: reviewNotes.trim() || null,
      rejectedReason: reviewStatus === "rejected" ? rejectedReason.trim() : null,
    });
  };

  return (
    <div className={styles.reconciliationLayout}>
      <div className={styles.safetyBanner}>
        <ShieldCheck size={18} />
        <span>
          This candidate is inert. Review actions do not change runtime references. Runtime activation requires a separate approved implementation step.
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              aria-label="Candidate type filter"
              className={styles.select}
              value={filters.candidateType}
              onChange={(event) => updateFilter("candidateType", event.target.value)}
            >
              <option value="">All candidate types</option>
              {RegulationReconciliationCandidateTypeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              aria-label="Severity filter"
              className={styles.select}
              value={filters.severity}
              onChange={(event) => updateFilter("severity", event.target.value)}
            >
              <option value="">All severities</option>
              {RegulationReconciliationCandidateSeverityArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              aria-label="Review status filter"
              className={styles.select}
              value={filters.reviewStatus}
              onChange={(event) => updateFilter("reviewStatus", event.target.value)}
            >
              <option value="">All review statuses</option>
              {RegulationReconciliationCandidateReviewStatusArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
            <input
              aria-label="Static reference ID filter"
              className={styles.inputInline}
              value={filters.staticReferenceId}
              onChange={(event) => updateFilter("staticReferenceId", event.target.value)}
              placeholder="Static reference ID"
            />
          </div>
          <div className={styles.filterGroup}>
            <input
              aria-label="DB regulation ID filter"
              className={styles.inputInline}
              value={filters.dbRegulationId}
              onChange={(event) => updateFilter("dbRegulationId", event.target.value)}
              placeholder="DB regulation ID"
            />
          </div>
          <div className={styles.filterGroup}>
            <input
              aria-label="Deterministic rule ID filter"
              className={styles.inputInline}
              value={filters.deterministicRuleId}
              onChange={(event) => updateFilter("deterministicRuleId", event.target.value)}
              placeholder="Rule ID"
            />
          </div>
          <div className={styles.filterGroup}>
            <input
              aria-label="Reconciliation run ID filter"
              className={styles.inputInline}
              value={filters.reconciliationRunId}
              onChange={(event) => updateFilter("reconciliationRunId", event.target.value)}
              placeholder="Run ID"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {listQuery.isLoading ? (
        <div className={styles.loading}>
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      ) : listQuery.error ? (
        <div className={styles.emptyState}>Backend unavailable. Reconciliation candidates could not be loaded.</div>
      ) : candidates.length === 0 ? (
        <div className={styles.emptyState}>
          {hasActiveFilters ? "No candidates match the current filters." : "No reconciliation candidates exist."}
        </div>
      ) : (
        <div className={styles.reviewGrid}>
          <div className={styles.cardList}>
            {candidates.map((candidate) => (
              <article key={candidate.id} className={styles.updateCard}>
                <div className={styles.cardTopRow}>
                  <Badge variant={variantForSeverity(candidate.severity)}>{formatEnum(candidate.severity)}</Badge>
                  <Badge variant={variantForStatus(candidate.reviewStatus)}>{formatEnum(candidate.reviewStatus)}</Badge>
                  <Badge variant={candidate.activeStatus === "inert" ? "success" : "error"}>{candidate.activeStatus}</Badge>
                  <span className={styles.reference}>{formatEnum(candidate.candidateType)}</span>
                  <span className={styles.dateText}>Created {formatDate(candidate.createdAt)}</span>
                </div>
                <div className={styles.cardBottomRow}>
                  <div className={styles.cardTitleSection}>
                    <div className={styles.title}>{candidate.mismatchSummary}</div>
                    <div className={styles.metaLine}>
                      <span>Static {candidate.staticReferenceId ?? "-"}</span>
                      <span>DB {candidate.dbRegulationId ?? "-"}</span>
                      <span>Rule {candidate.deterministicRuleId ?? "-"}</span>
                      <span>{candidate.jurisdiction ?? "No jurisdiction"}</span>
                      <span>{candidate.category ?? "No category"}</span>
                      <span>Reviewed {formatDate(candidate.reviewedAt)}</span>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={() => selectCandidate(candidate)}>
                      <Eye size={16} />
                      View Details
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className={styles.detailPanel} aria-label="Reconciliation candidate detail">
            {selectedCandidate ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <div className={styles.title}>Candidate #{selectedCandidate.id}</div>
                    <p className={styles.description}>{selectedCandidate.mismatchSummary}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedCandidateId(null)}>
                    Close
                  </Button>
                </div>

                {!selectedCandidateIsInert && (
                  <div className={styles.warningPanel}>
                    <AlertTriangle size={18} />
                    <span>This candidate is not inert. Review actions are disabled.</span>
                  </div>
                )}

                <section className={styles.detailSection}>
                  <h3>Summary</h3>
                  <div className={styles.detailGrid}>
                    <span>Recommended action</span><strong>{getRecommendedAction(selectedCandidate)}</strong>
                    <span>Severity</span><strong>{formatEnum(selectedCandidate.severity)}</strong>
                    <span>Candidate type</span><strong>{formatEnum(selectedCandidate.candidateType)}</strong>
                    <span>Finding type</span><strong>{formatEnum(selectedCandidate.sourceFindingType ?? "-")}</strong>
                    <span>Review status</span><strong>{formatEnum(selectedCandidate.reviewStatus)}</strong>
                    <span>Active status</span><strong>{selectedCandidate.activeStatus}</strong>
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Static reference snapshot</h3>
                  <div className={styles.detailGrid}>
                    <span>Static reference ID</span><strong>{selectedCandidate.staticReferenceId ?? "-"}</strong>
                    <span>Citation</span><strong>{selectedCandidate.citation ?? "-"}</strong>
                    <span>Source</span><strong>{selectedCandidate.sourceUrl ?? "-"}</strong>
                    <span>Jurisdiction</span><strong>{selectedCandidate.jurisdiction ?? "-"}</strong>
                    <span>Category</span><strong>{selectedCandidate.category ?? "-"}</strong>
                  </div>
                  <JsonBlock label="Sanitized old value" value={selectedCandidate.oldValue} />
                </section>

                <section className={styles.detailSection}>
                  <h3>DB governance snapshot</h3>
                  <div className={styles.detailGrid}>
                    <span>DB regulation ID</span><strong>{selectedCandidate.dbRegulationId ?? "-"}</strong>
                    <span>DB mapping ID</span><strong>{selectedCandidate.dbMappingId ?? "-"}</strong>
                    <span>Effective date</span><strong>{formatDate(selectedCandidate.effectiveDate)}</strong>
                    <span>Citation</span><strong>{selectedCandidate.citation ?? "-"}</strong>
                    <span>Source</span><strong>{selectedCandidate.sourceUrl ?? "-"}</strong>
                  </div>
                  <JsonBlock label="Sanitized proposed value" value={selectedCandidate.proposedValue} />
                </section>

                <section className={styles.detailSection}>
                  <h3>Diff and hashes</h3>
                  <div className={styles.detailGrid}>
                    <span>Mismatch hash</span><strong>{selectedCandidate.mismatchHash ?? "-"}</strong>
                    <span>Static snapshot hash</span><strong>{selectedCandidate.staticSnapshotHash ?? "-"}</strong>
                    <span>DB snapshot hash</span><strong>{selectedCandidate.dbSnapshotHash ?? "-"}</strong>
                    <span>Reconciliation run ID</span><strong>{selectedCandidate.reconciliationRunId ?? "-"}</strong>
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Safety</h3>
                  <div className={styles.safetyBanner}>
                    <ShieldCheck size={18} />
                    <span>This candidate is inert. Review actions do not change runtime references.</span>
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Review action</h3>
                  <textarea
                    aria-label="Review notes"
                    className={styles.textareaInline}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Review notes for approval-for-review actions"
                  />
                  <textarea
                    aria-label="Rejected reason"
                    className={styles.textareaInline}
                    value={rejectedReason}
                    onChange={(event) => setRejectedReason(event.target.value)}
                    placeholder="Rejected reason"
                  />
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={approvalConfirmed}
                      onChange={(event) => setApprovalConfirmed(event.target.checked)}
                    />
                    I understand this does not activate runtime regulation truth.
                  </label>
                  {actionError && <p className={styles.warningText}>{actionError}</p>}
                  <div className={styles.reviewActions}>
                    <Button
                      variant="secondary"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("needs_source")}
                    >
                      Mark Needs Source
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("needs_admin_decision")}
                    >
                      Mark Needs Admin Decision
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("approved_for_mapping_review")}
                    >
                      Approve for Mapping Review
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("approved_for_registry_update")}
                    >
                      Approve for Registry Update Review
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!selectedCandidateIsInert || updateStatus.isPending}
                      onClick={() => submitStatus("archived")}
                    >
                      Archive
                    </Button>
                  </div>
                </section>
              </>
            ) : (
              <div className={styles.emptyState}>Select a candidate to review mismatch details and review-only actions.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
