import { useMemo, useState } from "react";
import { AlertTriangle, Eye, Filter, Search, ShieldCheck } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { format } from "../helpers/dateUtils";
import {
  RegulationRuntimeBridgeActivationStatusArrayValues,
  RegulationRuntimeBridgeConsumerWordingModeArrayValues,
  RegulationRuntimeBridgeModeArrayValues,
  RegulationRuntimeBridgeReferenceClassArrayValues,
  type RegulationRuntimeBridgeActivationStatus,
  type RegulationRuntimeBridgeConsumerWordingMode,
  type RegulationRuntimeBridgeMode,
  type RegulationRuntimeBridgeReferenceClass,
} from "../helpers/schema";
import {
  useRuntimeBridgeMappings,
  useUpdateRuntimeBridgeMappingStatus,
} from "../helpers/useRegulationRegistry";
import styles from "../pages/regulatory-updates.module.css";

type RuntimeBridgeMappingRow = {
  id: number;
  bridgeMode: RegulationRuntimeBridgeMode;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  staticReferenceId?: string | null;
  dbRegulationId: string;
  dbMappingId?: number | null;
  referenceClass: RegulationRuntimeBridgeReferenceClass;
  consumerWordingMode: RegulationRuntimeBridgeConsumerWordingMode;
  rollbackStaticReferenceId?: string | null;
  activationStatus: RegulationRuntimeBridgeActivationStatus;
  activationReason?: string | null;
  testManifest?: unknown;
  approvedBy?: number | string | null;
  approvedAt?: Date | string | null;
  activatedBy?: number | string | null;
  activatedAt?: Date | string | null;
  deactivatedBy?: number | string | null;
  deactivatedAt?: Date | string | null;
  rollbackBy?: number | string | null;
  rollbackAt?: Date | string | null;
  sourceVersion?: string | null;
  staticSnapshotHash?: string | null;
  dbSnapshotHash?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

type RuntimeBridgeFilters = {
  bridgeMode: string;
  activationStatus: string;
  referenceClass: string;
  consumerWordingMode: string;
  deterministicRuleId: string;
  violationCategory: string;
  staticReferenceId: string;
  dbRegulationId: string;
  dbMappingId: string;
  sourceVersion: string;
};

type ReviewStatus = Exclude<RegulationRuntimeBridgeActivationStatus, "active_limited_runtime" | "draft">;

const EMPTY_FILTERS: RuntimeBridgeFilters = {
  bridgeMode: "",
  activationStatus: "",
  referenceClass: "",
  consumerWordingMode: "",
  deterministicRuleId: "",
  violationCategory: "",
  staticReferenceId: "",
  dbRegulationId: "",
  dbMappingId: "",
  sourceVersion: "",
};

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|full.?account|member.?number|packet|raw.?text|raw.?extracted|extracted.?text|credit.?report|source.?text|consumer.?personal|dob|date.?of.?birth|address|phone|email|name)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{9,}\b/g;

function formatEnum(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDate(value: Date | string | null | undefined): string {
  return value ? format(value, "MMM d, yyyy") : "-";
}

function statusVariant(status: string) {
  if (status === "active_limited_runtime") return "error";
  if (status.startsWith("approved_for")) return "success";
  if (status === "draft" || status === "paused") return "warning";
  if (status === "rejected" || status === "archived" || status === "rolled_back") return "default";
  return "info";
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalPositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeDisplayValue(nestedValue, key);
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

function manifestSummary(value: unknown): Array<[string, string]> {
  if (value === null || value === undefined) return [];
  const sanitized = sanitizeDisplayValue(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return [["value", String(sanitized ?? "-")]];
  }

  return Object.entries(sanitized as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, nestedValue]) => {
      if (nestedValue === null || nestedValue === undefined) return [key, "-"];
      if (Array.isArray(nestedValue)) return [key, `${nestedValue.length} item${nestedValue.length === 1 ? "" : "s"}`];
      if (typeof nestedValue === "object") return [key, "object"];
      return [key, String(nestedValue)];
    });
}

function DetailsRow({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "-" : String(value)}</strong>
    </>
  );
}

function SafetyBanner() {
  return (
    <div className={styles.safetyBanner}>
      <ShieldCheck size={18} />
      <span>
        This mapping is governance-only. Static runtime references remain active. Review actions do not activate runtime references. Runtime activation requires a separate approved implementation, tests, rollback plan, and explicit activation task.
      </span>
    </div>
  );
}

export function RegulationRuntimeBridgeMappingsTab() {
  const [filters, setFilters] = useState<RuntimeBridgeFilters>(EMPTY_FILTERS);
  const [selectedMappingId, setSelectedMappingId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [rollbackStaticReferenceId, setRollbackStaticReferenceId] = useState("");
  const [testManifestText, setTestManifestText] = useState("");
  const [limitedReviewConfirmed, setLimitedReviewConfirmed] = useState(false);
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const listFilters = useMemo(
    () => ({
      bridgeMode: clean(filters.bridgeMode) as RegulationRuntimeBridgeMode | undefined,
      activationStatus: clean(filters.activationStatus) as RegulationRuntimeBridgeActivationStatus | undefined,
      deterministicRuleId: clean(filters.deterministicRuleId),
      violationCategory: clean(filters.violationCategory),
      staticReferenceId: clean(filters.staticReferenceId),
      dbRegulationId: clean(filters.dbRegulationId),
      dbMappingId: optionalPositiveInteger(filters.dbMappingId),
      referenceClass: clean(filters.referenceClass) as RegulationRuntimeBridgeReferenceClass | undefined,
      consumerWordingMode: clean(filters.consumerWordingMode) as RegulationRuntimeBridgeConsumerWordingMode | undefined,
      limit: 100,
    }),
    [filters],
  );
  const detailFilters = useMemo(
    () => ({ ...listFilters, includeTestManifest: true, limit: 300 }),
    [listFilters],
  );

  const listQuery = useRuntimeBridgeMappings(listFilters);
  const detailQuery = useRuntimeBridgeMappings(detailFilters, { enabled: selectedMappingId !== null });
  const updateStatus = useUpdateRuntimeBridgeMappingStatus();

  const rows = (listQuery.data?.mappings ?? []) as RuntimeBridgeMappingRow[];
  const detailRows = (detailQuery.data?.mappings ?? []) as RuntimeBridgeMappingRow[];
  const visibleRows = filters.sourceVersion.trim()
    ? rows.filter((row) => (row.sourceVersion ?? "").includes(filters.sourceVersion.trim()))
    : rows;
  const selectedMapping =
    detailRows.find((row) => row.id === selectedMappingId) ??
    visibleRows.find((row) => row.id === selectedMappingId) ??
    null;
  const hasActiveFilters = Object.values(filters).some((value) => value.trim().length > 0);
  const selectedUnsupported = selectedMapping?.activationStatus === "active_limited_runtime";

  const updateFilter = <K extends keyof RuntimeBridgeFilters>(key: K, value: RuntimeBridgeFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const selectMapping = (mapping: RuntimeBridgeMappingRow) => {
    setSelectedMappingId(mapping.id);
    setReviewNotes("");
    setRejectedReason("");
    setRollbackStaticReferenceId(mapping.rollbackStaticReferenceId ?? "");
    setTestManifestText("");
    setLimitedReviewConfirmed(false);
    setArchiveConfirmed(false);
    setActionError(null);
  };

  const testManifestForSubmit = (): unknown => {
    const text = testManifestText.trim();
    if (!text) return selectedMapping?.testManifest ?? null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Limited runtime review requires valid JSON testManifest.");
    }
  };

  const submitStatus = async (activationStatus: ReviewStatus) => {
    if (!selectedMapping) return;
    if (selectedUnsupported) {
      setActionError("This status is unsupported by current service/API. Review actions are disabled.");
      return;
    }

    const notes = reviewNotes.trim();
    const rejected = rejectedReason.trim();
    const rollback = rollbackStaticReferenceId.trim();

    if (
      ["approved_for_shadow", "approved_for_advisory", "approved_for_limited_runtime", "paused", "rolled_back"].includes(
        activationStatus,
      ) &&
      !notes
    ) {
      setActionError("This review action requires review notes.");
      return;
    }
    if (activationStatus === "approved_for_limited_runtime") {
      if (!rollback) {
        setActionError("Limited runtime review requires rollbackStaticReferenceId.");
        return;
      }
      let testManifest: unknown;
      try {
        testManifest = testManifestForSubmit();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Limited runtime review requires testManifest.");
        return;
      }
      if (testManifest === null || testManifest === undefined) {
        setActionError("Limited runtime review requires testManifest.");
        return;
      }
      if (!limitedReviewConfirmed) {
        setActionError("Confirm that this action does not activate runtime regulation truth.");
        return;
      }
      setActionError(null);
      await updateStatus.mutateAsync({
        mappingId: selectedMapping.id,
        activationStatus,
        activationReason: notes,
        rollbackStaticReferenceId: rollback,
        testManifest,
      });
      return;
    }
    if (activationStatus === "rolled_back" && !rollback) {
      setActionError("Roll back requires rollbackStaticReferenceId.");
      return;
    }
    if (activationStatus === "rejected" && !rejected) {
      setActionError("Rejected runtime bridge mappings require rejectedReason.");
      return;
    }
    if (activationStatus === "archived" && !notes && !archiveConfirmed) {
      setActionError("Archive requires review notes or confirmation.");
      return;
    }

    setActionError(null);
    await updateStatus.mutateAsync({
      mappingId: selectedMapping.id,
      activationStatus,
      activationReason: activationStatus === "rejected" ? rejected : notes || "Archived by admin review.",
      rollbackStaticReferenceId: rollback || null,
    });
  };

  return (
    <div className={styles.reconciliationLayout}>
      <SafetyBanner />

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              aria-label="Bridge mode filter"
              className={styles.select}
              value={filters.bridgeMode}
              onChange={(event) => updateFilter("bridgeMode", event.target.value)}
            >
              <option value="">All bridge modes</option>
              {RegulationRuntimeBridgeModeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              aria-label="Activation status filter"
              className={styles.select}
              value={filters.activationStatus}
              onChange={(event) => updateFilter("activationStatus", event.target.value)}
            >
              <option value="">All review statuses</option>
              {RegulationRuntimeBridgeActivationStatusArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              aria-label="Reference class filter"
              className={styles.select}
              value={filters.referenceClass}
              onChange={(event) => updateFilter("referenceClass", event.target.value)}
            >
              <option value="">All reference classes</option>
              {RegulationRuntimeBridgeReferenceClassArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              aria-label="Consumer wording mode filter"
              className={styles.select}
              value={filters.consumerWordingMode}
              onChange={(event) => updateFilter("consumerWordingMode", event.target.value)}
            >
              <option value="">All wording modes</option>
              {RegulationRuntimeBridgeConsumerWordingModeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
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
              aria-label="Violation category filter"
              className={styles.inputInline}
              value={filters.violationCategory}
              onChange={(event) => updateFilter("violationCategory", event.target.value)}
              placeholder="Violation category"
            />
          </div>
          <div className={styles.filterGroup}>
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
              aria-label="DB mapping ID filter"
              className={styles.inputInline}
              value={filters.dbMappingId}
              onChange={(event) => updateFilter("dbMappingId", event.target.value)}
              placeholder="DB mapping ID"
            />
          </div>
          <div className={styles.filterGroup}>
            <input
              aria-label="Source version filter"
              className={styles.inputInline}
              value={filters.sourceVersion}
              onChange={(event) => updateFilter("sourceVersion", event.target.value)}
              placeholder="Source version"
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
        <div className={styles.emptyState}>Backend unavailable. Runtime bridge mappings could not be loaded.</div>
      ) : visibleRows.length === 0 ? (
        <div className={styles.emptyState}>
          {hasActiveFilters ? "No bridge mappings match the current filters." : "No bridge mappings exist."}
        </div>
      ) : (
        <div className={styles.reviewGrid}>
          <div className={styles.cardList}>
            {visibleRows.map((mapping) => (
              <article key={mapping.id} className={styles.updateCard}>
                <div className={styles.cardTopRow}>
                  <Badge variant={statusVariant(mapping.activationStatus)}>{formatEnum(mapping.activationStatus)}</Badge>
                  <Badge variant="info">{formatEnum(mapping.bridgeMode)}</Badge>
                  <span className={styles.reference}>{formatEnum(mapping.referenceClass)}</span>
                  <span className={styles.reference}>{formatEnum(mapping.consumerWordingMode)}</span>
                  <span className={styles.dateText}>Updated {formatDate(mapping.updatedAt)}</span>
                </div>
                <div className={styles.cardBottomRow}>
                  <div className={styles.cardTitleSection}>
                    <div className={styles.title}>{mapping.deterministicRuleId ?? mapping.violationCategory ?? mapping.staticReferenceId ?? `Mapping #${mapping.id}`}</div>
                    <div className={styles.metaLine}>
                      <span>Static {mapping.staticReferenceId ?? "-"}</span>
                      <span>DB {mapping.dbRegulationId}</span>
                      <span>DB mapping {mapping.dbMappingId ?? "-"}</span>
                      <span>Source {mapping.sourceVersion ?? "-"}</span>
                      <span>Created {formatDate(mapping.createdAt)}</span>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={() => selectMapping(mapping)}>
                      <Eye size={16} />
                      View Details
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className={styles.detailPanel} aria-label="Runtime bridge mapping detail">
            {selectedMapping ? (
              <>
                <div className={styles.detailHeader}>
                  <div>
                    <div className={styles.title}>Mapping #{selectedMapping.id}</div>
                    <p className={styles.description}>{selectedMapping.activationReason ?? "Review-only bridge mapping governance record."}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedMappingId(null)}>
                    Close
                  </Button>
                </div>

                {selectedUnsupported && (
                  <div className={styles.warningPanel}>
                    <AlertTriangle size={18} />
                    <span>This status is unsupported by current service/API. Review actions are disabled.</span>
                  </div>
                )}

                <section className={styles.detailSection}>
                  <h3>Governance summary</h3>
                  <div className={styles.detailGrid}>
                    <DetailsRow label="Bridge mode" value={formatEnum(selectedMapping.bridgeMode)} />
                    <DetailsRow label="Review status" value={formatEnum(selectedMapping.activationStatus)} />
                    <DetailsRow label="Reference class" value={formatEnum(selectedMapping.referenceClass)} />
                    <DetailsRow label="Wording mode" value={formatEnum(selectedMapping.consumerWordingMode)} />
                    <DetailsRow label="Reason" value={selectedMapping.activationReason} />
                    <DetailsRow label="Source version" value={selectedMapping.sourceVersion} />
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Rule and reference identifiers</h3>
                  <div className={styles.detailGrid}>
                    <DetailsRow label="Deterministic rule ID" value={selectedMapping.deterministicRuleId} />
                    <DetailsRow label="Violation category" value={selectedMapping.violationCategory} />
                    <DetailsRow label="Static reference ID" value={selectedMapping.staticReferenceId} />
                    <DetailsRow label="DB regulation ID" value={selectedMapping.dbRegulationId} />
                    <DetailsRow label="DB mapping ID" value={selectedMapping.dbMappingId} />
                    <DetailsRow label="Rollback static reference ID" value={selectedMapping.rollbackStaticReferenceId} />
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Test and rollback</h3>
                  <div className={styles.detailGrid}>
                    <DetailsRow label="Rollback static reference" value={selectedMapping.rollbackStaticReferenceId} />
                    <DetailsRow label="Static snapshot hash" value={selectedMapping.staticSnapshotHash} />
                    <DetailsRow label="DB snapshot hash" value={selectedMapping.dbSnapshotHash} />
                    {manifestSummary(selectedMapping.testManifest).map(([key, value]) => (
                      <DetailsRow key={key} label={`Test manifest ${key}`} value={value} />
                    ))}
                    {manifestSummary(selectedMapping.testManifest).length === 0 && (
                      <DetailsRow label="Test manifest summary" value="-" />
                    )}
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Lifecycle</h3>
                  <div className={styles.detailGrid}>
                    <DetailsRow label="Approved by" value={selectedMapping.approvedBy} />
                    <DetailsRow label="Approved at" value={formatDate(selectedMapping.approvedAt)} />
                    <DetailsRow label="Activated by" value={selectedMapping.activatedBy} />
                    <DetailsRow label="Activated at" value={formatDate(selectedMapping.activatedAt)} />
                    <DetailsRow label="Deactivated by" value={selectedMapping.deactivatedBy} />
                    <DetailsRow label="Deactivated at" value={formatDate(selectedMapping.deactivatedAt)} />
                    <DetailsRow label="Rollback by" value={selectedMapping.rollbackBy} />
                    <DetailsRow label="Rollback at" value={formatDate(selectedMapping.rollbackAt)} />
                    <DetailsRow label="Created at" value={formatDate(selectedMapping.createdAt)} />
                    <DetailsRow label="Updated at" value={formatDate(selectedMapping.updatedAt)} />
                  </div>
                </section>

                <section className={styles.detailSection}>
                  <h3>Safety</h3>
                  <SafetyBanner />
                </section>

                <section className={styles.detailSection}>
                  <h3>Review action</h3>
                  <textarea
                    aria-label="Review notes"
                    className={styles.textareaInline}
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Review notes"
                  />
                  <textarea
                    aria-label="Rejected reason"
                    className={styles.textareaInline}
                    value={rejectedReason}
                    onChange={(event) => setRejectedReason(event.target.value)}
                    placeholder="Rejected reason"
                  />
                  <input
                    aria-label="Rollback static reference"
                    className={styles.input}
                    value={rollbackStaticReferenceId}
                    onChange={(event) => setRollbackStaticReferenceId(event.target.value)}
                    placeholder="Rollback static reference ID"
                  />
                  <textarea
                    aria-label="Limited runtime review test manifest"
                    className={styles.textareaInline}
                    value={testManifestText}
                    onChange={(event) => setTestManifestText(event.target.value)}
                    placeholder='{"expectedRuntimeSource":"static_runtime"}'
                  />
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={limitedReviewConfirmed}
                      onChange={(event) => setLimitedReviewConfirmed(event.target.checked)}
                    />
                    I understand this does not activate runtime regulation truth.
                  </label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={archiveConfirmed}
                      onChange={(event) => setArchiveConfirmed(event.target.checked)}
                    />
                    Archive this governance record after review.
                  </label>
                  {actionError && <p className={styles.warningText}>{actionError}</p>}
                  <div className={styles.reviewActions}>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("approved_for_shadow")}
                    >
                      Approve for Shadow
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("approved_for_advisory")}
                    >
                      Approve for Advisory
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("approved_for_limited_runtime")}
                    >
                      Approve for Limited Runtime Review
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("paused")}
                    >
                      Pause
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("rolled_back")}
                    >
                      Roll Back
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={selectedUnsupported || updateStatus.isPending}
                      onClick={() => submitStatus("archived")}
                    >
                      Archive
                    </Button>
                  </div>
                </section>
              </>
            ) : (
              <div className={styles.emptyState}>Select a bridge mapping to inspect governance details and review-only actions.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
