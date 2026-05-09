import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Link2,
  Plus,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Input } from "./Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { Textarea } from "./Textarea";
import {
  useCreateViolationCorrection,
  useExportViolationTrainingExamples,
  useFinalizeViolationCorrection,
  useUpdateViolationCorrection,
  useUpdateViolationCorrectionEvidence,
  useUpdateViolationRegulationReference,
  useViolationCorrectionRunDetail,
  useViolationCorrectionRuns,
} from "../helpers/violationCorrectionQueries";
import type { ViolationCorrectionSourceFilter } from "../helpers/violationCorrectionQueries";
import type {
  OriginalViolationDetail,
  SuggestedRegulationReference,
  TradelineReviewDetail,
  ViolationReviewCorrectionDetail,
} from "../endpoints/admin/violation-correction/common";
import { authorityIssueLabel, getLegalAuthorityById } from "../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../helpers/regulationRegistry";
import styles from "./AdminViolationCorrectionPanel.module.css";

const ACTIONS = [
  "confirmed",
  "corrected",
  "rejected",
  "irrelevant",
  "duplicate",
  "insufficient_evidence",
] as const;

const TRAINING_LABELS = [
  "false_positive",
  "false_negative",
  "misclassified",
  "weak_evidence",
  "irrelevant",
  "confirmed_good",
] as const;

const SEVERITIES = ["INFO", "WARNING", "ERROR", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type CorrectionForm = {
  id: number | null;
  originalViolationId: number | null;
  correctionAction: (typeof ACTIONS)[number];
  correctedViolationType: string;
  correctedSummary: string;
  correctedExplanation: string;
  correctedSeverity: string;
  correctedConfidence: string;
  correctionReason: string;
  adminNotes: string;
  trainingLabel: (typeof TRAINING_LABELS)[number];
  trainingNoteOnly: boolean;
  useForTraining: boolean;
};

type EvidenceForm = {
  pageNumber: string;
  fieldName: string;
  textExcerpt: string;
  normalizedValue: string;
  evidenceReason: string;
};

type RegulationForm = {
  jurisdiction: "federal" | "provincial" | "bureau_standard" | "internal_rule";
  provinceOrTerritory: string;
  regulatorOrStandardBody: string;
  regulationName: string;
  statuteOrRuleName: string;
  sectionNumber: string;
  subsectionNumber: string;
  regulationTextExcerpt: string;
  citationUrl: string;
  citationSource: string;
  citationConfidence: string;
  adminVerifiedCitation: boolean;
  adminNotes: string;
};

function labelize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function authorityLabelForSavedReference(item: {
  jurisdiction: string;
  regulationName: string;
  statuteOrRuleName: string;
  sectionNumber: string;
}): string {
  const registryEntry = Object.values(regulationRegistry.STATUTE_ENTRIES).find(
    (entry) =>
      entry.statute === item.regulationName &&
      entry.shortLabel === item.statuteOrRuleName &&
      entry.citation === item.sectionNumber,
  );
  const authority = registryEntry ? getLegalAuthorityById(registryEntry.id) : null;
  if (authority) return authorityIssueLabel(authority);
  if (item.jurisdiction === "bureau_standard") return "Mapped reporting-standard issue";
  return "Mapped legal authority issue";
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleDateString();
}

function defaultEvidenceForm(sourceText?: string | null): EvidenceForm {
  return {
    pageNumber: "1",
    fieldName: "",
    textExcerpt: sourceText ? sourceText.slice(0, 500) : "",
    normalizedValue: "",
    evidenceReason: "",
  };
}

function defaultRegulationForm(): RegulationForm {
  return {
    jurisdiction: "federal",
    provinceOrTerritory: "",
    regulatorOrStandardBody: "",
    regulationName: "",
    statuteOrRuleName: "",
    sectionNumber: "",
    subsectionNumber: "",
    regulationTextExcerpt: "",
    citationUrl: "",
    citationSource: "Admin review",
    citationConfidence: "0.75",
    adminVerifiedCitation: false,
    adminNotes: "",
  };
}

function correctionToForm(
  correction: ViolationReviewCorrectionDetail | null,
  violation: OriginalViolationDetail | null,
): CorrectionForm {
  if (correction) {
    return {
      id: correction.id,
      originalViolationId: correction.originalViolationId,
      correctionAction: correction.correctionAction as CorrectionForm["correctionAction"],
      correctedViolationType: correction.correctedViolationType ?? violation?.violationCategory ?? "",
      correctedSummary: correction.correctedSummary ?? "",
      correctedExplanation: correction.correctedExplanation ?? "",
      correctedSeverity: correction.correctedSeverity ?? violation?.severity ?? "WARNING",
      correctedConfidence:
        correction.correctedConfidence == null ? "" : String(correction.correctedConfidence),
      correctionReason: correction.correctionReason ?? "",
      adminNotes: correction.adminNotes ?? "",
      trainingLabel: (correction.trainingLabel as CorrectionForm["trainingLabel"]) ?? "confirmed_good",
      trainingNoteOnly: correction.trainingNoteOnly,
      useForTraining: correction.useForTraining,
    };
  }

  return {
    id: null,
    originalViolationId: violation?.id ?? null,
    correctionAction: violation ? "confirmed" : "corrected",
    correctedViolationType: violation?.violationCategory ?? "",
    correctedSummary: violation?.userExplanation ?? "",
    correctedExplanation: violation?.recommendedAction ?? "",
    correctedSeverity: violation?.severity ?? "WARNING",
    correctedConfidence: violation?.confidenceScore == null ? "" : String(violation.confidenceScore),
    correctionReason: "",
    adminNotes: "",
    trainingLabel: violation ? "confirmed_good" : "false_negative",
    trainingNoteOnly: false,
    useForTraining: true,
  };
}

function regulationSuggestionToForm(ref: SuggestedRegulationReference): RegulationForm {
  return {
    jurisdiction: ref.jurisdiction,
    provinceOrTerritory: ref.provinceOrTerritory ?? "",
    regulatorOrStandardBody: ref.regulatorOrStandardBody,
    regulationName: ref.regulationName,
    statuteOrRuleName: ref.statuteOrRuleName,
    sectionNumber: ref.sectionNumber,
    subsectionNumber: ref.subsectionNumber ?? "",
    regulationTextExcerpt: ref.regulationTextExcerpt,
    citationUrl: ref.citationUrl ?? "",
    citationSource: ref.citationSource,
    citationConfidence: String(ref.citationConfidence),
    adminVerifiedCitation: ref.adminVerifiedCitation,
    adminNotes: ref.adminNotes ?? "",
  };
}

export function AdminViolationCorrectionPanel({
  sourceFilters,
  initialSelection,
}: {
  sourceFilters?: ViolationCorrectionSourceFilter[];
  initialSelection?: {
    extractionRunId?: number | null;
    tradelineId?: number | null;
    violationId?: number | null;
  };
}) {
  const initialExtractionRunId = initialSelection?.extractionRunId ?? null;
  const initialTradelineId = initialSelection?.tradelineId ?? null;
  const initialViolationId = initialSelection?.violationId ?? null;
  const [reviewStatus, setReviewStatus] = useState<"needs_review" | "finalized" | "all">(
    initialExtractionRunId ? "all" : "needs_review",
  );
  const hasSourceFilter = sourceFilters !== undefined;
  const canLoadRuns = !hasSourceFilter || sourceFilters.length > 0;
  const { data: runsData, isLoading: isLoadingRuns } = useViolationCorrectionRuns(
    reviewStatus,
    sourceFilters,
    canLoadRuns,
    hasSourceFilter,
  );
  const runs = canLoadRuns ? runsData?.runs ?? [] : [];
  const runTotal = canLoadRuns ? runsData?.total ?? 0 : 0;
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const activeRunId = canLoadRuns ? selectedRunId : null;
  const { data: detail, isLoading: isLoadingDetail } = useViolationCorrectionRunDetail(activeRunId);
  const [selectedTradelineId, setSelectedTradelineId] = useState<number | null>(null);
  const [selectedViolationId, setSelectedViolationId] = useState<number | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [correctionForm, setCorrectionForm] = useState<CorrectionForm>(() => correctionToForm(null, null));
  const [evidenceForm, setEvidenceForm] = useState<EvidenceForm>(() => defaultEvidenceForm());
  const [regulationForm, setRegulationForm] = useState<RegulationForm>(() => defaultRegulationForm());

  const createCorrection = useCreateViolationCorrection();
  const updateCorrection = useUpdateViolationCorrection();
  const updateEvidence = useUpdateViolationCorrectionEvidence();
  const updateRegulation = useUpdateViolationRegulationReference();
  const finalizeCorrection = useFinalizeViolationCorrection();
  const exportTraining = useExportViolationTrainingExamples();

  useEffect(() => {
    if (!canLoadRuns || runs.length === 0) {
      setSelectedRunId(null);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      const requestedRun = initialExtractionRunId
        ? runs.find((run) => run.id === initialExtractionRunId)
        : null;
      setSelectedRunId(requestedRun?.id ?? runs[0].id);
    }
  }, [canLoadRuns, initialExtractionRunId, runs, selectedRunId]);

  useEffect(() => {
    if (!detail?.tradelines.length) {
      setSelectedTradelineId(null);
      return;
    }

    if (!selectedTradelineId || !detail.tradelines.some((tradeline) => tradeline.id === selectedTradelineId)) {
      const requestedTradeline = initialTradelineId
        ? detail.tradelines.find((tradeline) => tradeline.id === initialTradelineId)
        : null;
      setSelectedTradelineId(requestedTradeline?.id ?? detail.tradelines[0].id);
    }
  }, [detail, initialTradelineId, selectedTradelineId]);

  const selectedTradeline = useMemo<TradelineReviewDetail | null>(() => {
    return detail?.tradelines.find((tradeline) => tradeline.id === selectedTradelineId) ?? null;
  }, [detail, selectedTradelineId]);

  const selectedViolation = useMemo<OriginalViolationDetail | null>(() => {
    if (!selectedTradeline || manualMode) return null;
    return selectedTradeline.violations.find((violation) => violation.id === selectedViolationId) ?? null;
  }, [manualMode, selectedTradeline, selectedViolationId]);

  const activeCorrection = useMemo<ViolationReviewCorrectionDetail | null>(() => {
    if (!selectedTradeline) return null;
    if (manualMode) {
      return selectedTradeline.manualCorrections[0] ?? null;
    }
    return selectedViolation?.corrections[0] ?? null;
  }, [manualMode, selectedTradeline, selectedViolation]);

  useEffect(() => {
    if (!selectedTradeline) return;
    const requestedViolation = initialViolationId
      ? selectedTradeline.violations.find((violation) => violation.id === initialViolationId)
      : null;
    const firstViolation = requestedViolation ?? selectedTradeline.violations[0];
    if (!firstViolation) {
      setManualMode(true);
      setSelectedViolationId(null);
      return;
    }
    if (
      !manualMode &&
      (!selectedViolationId ||
        !selectedTradeline.violations.some((violation) => violation.id === selectedViolationId))
    ) {
      setSelectedViolationId(firstViolation.id);
    }
  }, [initialViolationId, manualMode, selectedTradeline, selectedViolationId]);

  useEffect(() => {
    setCorrectionForm(correctionToForm(activeCorrection, selectedViolation));
    setEvidenceForm(defaultEvidenceForm(selectedTradeline?.sourceText));
  }, [activeCorrection, selectedTradeline?.sourceText, selectedViolation]);

  const evidenceCount = activeCorrection?.evidence.length ?? 0;
  const activeRegulationCount =
    activeCorrection?.regulationReferences.filter((ref) => ref.mappingStatus !== "incorrect").length ?? 0;
  const canFinalize =
    Boolean(correctionForm.id) &&
    (correctionForm.trainingNoteOnly || evidenceCount > 0) &&
    (correctionForm.trainingNoteOnly ||
      correctionForm.correctionAction === "rejected" ||
      correctionForm.correctionAction === "irrelevant" ||
      correctionForm.correctionAction === "duplicate" ||
      correctionForm.correctionAction === "insufficient_evidence" ||
      activeRegulationCount > 0);

  const selectViolation = (violation: OriginalViolationDetail) => {
    setManualMode(false);
    setSelectedViolationId(violation.id);
  };

  const startManualCorrection = () => {
    setManualMode(true);
    setSelectedViolationId(null);
    setCorrectionForm(correctionToForm(null, null));
    setEvidenceForm(defaultEvidenceForm(selectedTradeline?.sourceText));
  };

  const saveCorrection = async () => {
    if (!detail || !selectedTradeline) return;

    const payload = {
      extractionRunId: detail.run.id,
      tradelineId: selectedTradeline.id,
      originalViolationId: correctionForm.originalViolationId,
      correctionAction: correctionForm.correctionAction,
      correctedViolationType: correctionForm.correctedViolationType || null,
      correctedSummary: correctionForm.correctedSummary || null,
      correctedExplanation: correctionForm.correctedExplanation || null,
      correctedSeverity: correctionForm.correctedSeverity || null,
      correctedConfidence: correctionForm.correctedConfidence
        ? Number(correctionForm.correctedConfidence)
        : null,
      correctionReason: correctionForm.correctionReason || null,
      adminNotes: correctionForm.adminNotes || null,
      trainingLabel: correctionForm.trainingLabel,
      trainingNoteOnly: correctionForm.trainingNoteOnly,
      useForTraining: correctionForm.useForTraining,
      status: "in_review" as const,
    };

    try {
      const result = correctionForm.id
        ? await updateCorrection.mutateAsync({ id: correctionForm.id, ...payload })
        : await createCorrection.mutateAsync(payload);
      setCorrectionForm(correctionToForm(result.correction, selectedViolation));
      toast.success("Correction saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save correction");
    }
  };

  const addEvidence = async () => {
    if (!detail || !selectedTradeline || !correctionForm.id) {
      toast.error("Save the correction before linking evidence");
      return;
    }
    const evidenceRunId = activeCorrection?.extractionRunId ?? detail.run.id;

    try {
      await updateEvidence.mutateAsync({
        action: "add",
        correctionId: correctionForm.id,
        evidence: {
          sourceDocumentId: detail.run.reportArtifactId,
          extractionRunId: evidenceRunId,
          tradelineId: selectedTradeline.id,
          pageNumber: Number(evidenceForm.pageNumber || 1),
          fieldName: evidenceForm.fieldName || null,
          textExcerpt: evidenceForm.textExcerpt,
          normalizedValue: evidenceForm.normalizedValue || null,
          evidenceReason: evidenceForm.evidenceReason,
          adminSelected: true,
        },
      });
      setEvidenceForm(defaultEvidenceForm(selectedTradeline.sourceText));
      toast.success("Evidence linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link evidence");
    }
  };

  const removeEvidence = async (evidenceId: number) => {
    if (!correctionForm.id) return;
    try {
      await updateEvidence.mutateAsync({
        action: "remove",
        correctionId: correctionForm.id,
        evidenceId,
      });
      toast.success("Evidence removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove evidence");
    }
  };

  const addRegulationReference = async (source?: SuggestedRegulationReference) => {
    if (!detail || !selectedTradeline || !correctionForm.id) {
      toast.error("Save the correction before linking a reference");
      return;
    }
    const referenceRunId = activeCorrection?.extractionRunId ?? detail.run.id;

    const form = source ? regulationSuggestionToForm(source) : regulationForm;
    try {
      await updateRegulation.mutateAsync({
        action: "add",
        correctionId: correctionForm.id,
        reference: {
          violationId: correctionForm.originalViolationId,
          extractionRunId: referenceRunId,
          tradelineId: selectedTradeline.id,
          jurisdiction: form.jurisdiction,
          country: "Canada",
          provinceOrTerritory: form.provinceOrTerritory || null,
          regulatorOrStandardBody: form.regulatorOrStandardBody,
          regulationName: form.regulationName,
          statuteOrRuleName: form.statuteOrRuleName,
          sectionNumber: form.sectionNumber,
          subsectionNumber: form.subsectionNumber || null,
          regulationTextExcerpt: form.regulationTextExcerpt,
          citationUrl: form.citationUrl || null,
          citationSource: form.citationSource,
          citationConfidence: Number(form.citationConfidence || 0.75),
          adminVerifiedCitation: form.adminVerifiedCitation,
          adminNotes: form.adminNotes || null,
          mappingStatus: "active",
        },
      });
      if (!source) setRegulationForm(defaultRegulationForm());
      toast.success("Reference linked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link reference");
    }
  };

  const updateReferenceStatus = async (referenceId: number, mappingStatus: "active" | "incorrect", verified: boolean) => {
    if (!correctionForm.id) return;
    try {
      await updateRegulation.mutateAsync({
        action: "update",
        correctionId: correctionForm.id,
        referenceId,
        reference: {
          mappingStatus,
          adminVerifiedCitation: verified,
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update reference");
    }
  };

  const removeReference = async (referenceId: number) => {
    if (!correctionForm.id) return;
    try {
      await updateRegulation.mutateAsync({
        action: "remove",
        correctionId: correctionForm.id,
        referenceId,
      });
      toast.success("Reference removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove reference");
    }
  };

  const finalizeActiveCorrection = async () => {
    if (!correctionForm.id) return;
    try {
      await finalizeCorrection.mutateAsync({ correctionId: correctionForm.id });
      toast.success("Correction finalized");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to finalize correction");
    }
  };

  const downloadTrainingExamples = async () => {
    try {
      const exported = await exportTraining.mutateAsync({ useForTrainingOnly: true });
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `violation-training-examples-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${exported.count} training examples`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Training export failed");
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <Select value={reviewStatus} onValueChange={(value: any) => setReviewStatus(value)}>
            <SelectTrigger className={styles.compactSelect}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="all">All runs</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="info">{runTotal} runs</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTrainingExamples} disabled={exportTraining.isPending}>
          <Download size={16} /> Export training
        </Button>
      </div>

      <div className={styles.layout}>
        <aside className={styles.runList}>
          <div className={styles.sectionHeader}>Extraction Runs</div>
          {!canLoadRuns ? (
            <div className={styles.emptyState}>No active parser test case sources</div>
          ) : isLoadingRuns ? (
            <div className={styles.emptyState}>Loading runs</div>
          ) : runs.length === 0 ? (
            <div className={styles.emptyState}>No runs</div>
          ) : (
            runs.map((run) => (
              <button
                key={run.id}
                className={styles.runButton}
                data-active={run.id === selectedRunId}
                onClick={() => {
                  setSelectedRunId(run.id);
                  setSelectedTradelineId(null);
                  setSelectedViolationId(null);
                  setManualMode(false);
                }}
              >
                <span className={styles.runTitle}>Run #{run.id}</span>
                <span className={styles.runMeta}>
                  Artifact #{run.reportArtifactId} · {formatDate(run.completedAt ?? run.createdAt)}
                </span>
                <span className={styles.runStats}>
                  {run.tradelineCount} tradelines · {run.violationCount} issues · {run.finalizedCorrectionCount} final
                </span>
              </button>
            ))
          )}
        </aside>

        <main className={styles.reviewGrid}>
          {isLoadingDetail ? (
            <div className={styles.emptyState}>Loading review data</div>
          ) : !detail ? (
            <div className={styles.emptyState}>Select a run</div>
          ) : (
            <>
              <section className={styles.tradelineColumn}>
                <div className={styles.sectionHeader}>Tradelines</div>
                <div className={styles.tradelineList}>
                  {detail.tradelines.map((tradeline) => (
                    <button
                      key={tradeline.id}
                      className={styles.tradelineButton}
                      data-active={tradeline.id === selectedTradelineId}
                      onClick={() => {
                        setSelectedTradelineId(tradeline.id);
                        setSelectedViolationId(null);
                        setManualMode(false);
                      }}
                    >
                      <span className={styles.tradelineName}>{tradeline.creditorName ?? "Unknown creditor"}</span>
                      <span className={styles.tradelineMeta}>
                        {tradeline.bureauName ?? "Bureau"} · {tradeline.accountNumber}
                      </span>
                      <span className={styles.tradelineMeta}>
                        {tradeline.violations.length} original · {tradeline.manualCorrections.length} added
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.originalColumn}>
                <div className={styles.sectionHeadingRow}>
                  <div className={styles.sectionHeader}>Original Extraction</div>
                  <Button variant="outline" size="sm" onClick={startManualCorrection}>
                    <Plus size={16} /> Missed issue
                  </Button>
                </div>
                {selectedTradeline ? (
                  <div className={styles.originalStack}>
                    <div className={styles.snapshot}>
                      <strong>{selectedTradeline.creditorName ?? "Unknown creditor"}</strong>
                      <span>{selectedTradeline.bureauName ?? "Bureau"} · {selectedTradeline.accountNumber}</span>
                      <span>Status {selectedTradeline.status ?? "not set"} · Balance {selectedTradeline.balance ?? "not set"}</span>
                    </div>

                    {manualMode && (
                      <button className={styles.violationButton} data-active="true">
                        <span className={styles.violationTitle}>Manually added issue</span>
                        <span className={styles.violationText}>No original machine issue selected</span>
                      </button>
                    )}

                    {selectedTradeline.violations.map((violation) => (
                      <button
                        key={violation.id}
                        className={styles.violationButton}
                        data-active={!manualMode && violation.id === selectedViolationId}
                        onClick={() => selectViolation(violation)}
                      >
                        <span className={styles.violationTitle}>{labelize(violation.violationCategory)}</span>
                        <span className={styles.violationText}>{violation.userExplanation ?? "No summary"}</span>
                        <span className={styles.violationMeta}>
                          Confidence {violation.confidenceScore ?? "n/a"} · {violation.corrections.length} correction(s)
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>Select a tradeline</div>
                )}
              </section>

              <section className={styles.truthColumn}>
                <div className={styles.sectionHeader}>Admin Correction</div>
                <div className={styles.formGrid}>
                  <label>
                    Action
                    <Select
                      value={correctionForm.correctionAction}
                      onValueChange={(value: any) =>
                        setCorrectionForm((prev) => ({ ...prev, correctionAction: value }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((action) => (
                          <SelectItem key={action} value={action}>{labelize(action)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    Type
                    <Input
                      value={correctionForm.correctedViolationType}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, correctedViolationType: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Severity
                    <Select
                      value={correctionForm.correctedSeverity || "WARNING"}
                      onValueChange={(value) =>
                        setCorrectionForm((prev) => ({ ...prev, correctedSeverity: value }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEVERITIES.map((severity) => (
                          <SelectItem key={severity} value={severity}>{severity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    Confidence
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={correctionForm.correctedConfidence}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, correctedConfidence: event.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Summary
                    <Textarea
                      value={correctionForm.correctedSummary}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, correctedSummary: event.target.value }))
                      }
                      rows={3}
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Explanation
                    <Textarea
                      value={correctionForm.correctedExplanation}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, correctedExplanation: event.target.value }))
                      }
                      rows={4}
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Correction Reason
                    <Textarea
                      value={correctionForm.correctionReason}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, correctionReason: event.target.value }))
                      }
                      rows={2}
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Reviewer Notes
                    <Textarea
                      value={correctionForm.adminNotes}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, adminNotes: event.target.value }))
                      }
                      rows={2}
                    />
                  </label>
                </div>

                <div className={styles.trainingStrip}>
                  <label>
                    Training Label
                    <Select
                      value={correctionForm.trainingLabel}
                      onValueChange={(value: any) =>
                        setCorrectionForm((prev) => ({ ...prev, trainingLabel: value }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRAINING_LABELS.map((label) => (
                          <SelectItem key={label} value={label}>{labelize(label)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={correctionForm.useForTraining}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, useForTraining: event.target.checked }))
                      }
                    />
                    Use for training
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={correctionForm.trainingNoteOnly}
                      onChange={(event) =>
                        setCorrectionForm((prev) => ({ ...prev, trainingNoteOnly: event.target.checked }))
                      }
                    />
                    Training note only
                  </label>
                </div>

                <div className={styles.actionRow}>
                  <Button onClick={saveCorrection} disabled={!selectedTradeline || createCorrection.isPending || updateCorrection.isPending}>
                    <Save size={16} /> Save correction
                  </Button>
                  <Button
                    variant="outline"
                    onClick={finalizeActiveCorrection}
                    disabled={!canFinalize || finalizeCorrection.isPending}
                  >
                    <ShieldCheck size={16} /> Finalize
                  </Button>
                  <Badge variant={activeCorrection?.status === "finalized" ? "success" : "warning"}>
                    {activeCorrection?.status ?? "unsaved"}
                  </Badge>
                </div>
              </section>

              <section className={styles.evidenceColumn}>
                <div className={styles.sectionHeader}>Evidence</div>
                <div className={styles.requirementRow}>
                  <Badge variant={evidenceCount > 0 || correctionForm.trainingNoteOnly ? "success" : "warning"}>
                    {evidenceCount} linked
                  </Badge>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    Page
                    <Input
                      type="number"
                      min="1"
                      value={evidenceForm.pageNumber}
                      onChange={(event) => setEvidenceForm((prev) => ({ ...prev, pageNumber: event.target.value }))}
                    />
                  </label>
                  <label>
                    Field
                    <Input
                      value={evidenceForm.fieldName}
                      onChange={(event) => setEvidenceForm((prev) => ({ ...prev, fieldName: event.target.value }))}
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Excerpt
                    <Textarea
                      value={evidenceForm.textExcerpt}
                      onChange={(event) => setEvidenceForm((prev) => ({ ...prev, textExcerpt: event.target.value }))}
                      rows={4}
                    />
                  </label>
                  <label>
                    Normalized Value
                    <Input
                      value={evidenceForm.normalizedValue}
                      onChange={(event) => setEvidenceForm((prev) => ({ ...prev, normalizedValue: event.target.value }))}
                    />
                  </label>
                  <label>
                    Reason
                    <Input
                      value={evidenceForm.evidenceReason}
                      onChange={(event) => setEvidenceForm((prev) => ({ ...prev, evidenceReason: event.target.value }))}
                    />
                  </label>
                </div>
                <Button variant="outline" size="sm" onClick={addEvidence} disabled={updateEvidence.isPending}>
                  <Link2 size={16} /> Link evidence
                </Button>
                <div className={styles.linkedList}>
                  {activeCorrection?.evidence.map((item) => (
                    <div key={item.id} className={styles.linkedItem}>
                      <div>
                        <strong>Page {item.pageNumber}</strong>
                        <span>{item.fieldName ?? "Field not set"}</span>
                        <p>{item.textExcerpt}</p>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeEvidence(item.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.regulationColumn}>
                <div className={styles.sectionHeader}>Regulation Mapping</div>
                <div className={styles.requirementRow}>
                  <Badge variant={activeRegulationCount > 0 || correctionForm.trainingNoteOnly ? "success" : "warning"}>
                    {activeRegulationCount} active
                  </Badge>
                </div>
                {selectedViolation?.suggestedRegulationReferences.length ? (
                  <div className={styles.suggestionList}>
                    {selectedViolation.suggestedRegulationReferences.map((ref, index) => (
                      <button
                        key={`${ref.regulationName}-${ref.sectionNumber}-${index}`}
                        className={styles.suggestionButton}
                        onClick={() => addRegulationReference(ref)}
                      >
                        <Scale size={14} />
                        <span>{ref.authorityIssueLabel}</span>
                        <span>{ref.regulationName} · {ref.sectionNumber}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={styles.formGrid}>
                  <label>
                    Jurisdiction
                    <Select
                      value={regulationForm.jurisdiction}
                      onValueChange={(value: any) =>
                        setRegulationForm((prev) => ({ ...prev, jurisdiction: value }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="federal">Federal</SelectItem>
                        <SelectItem value="provincial">Provincial</SelectItem>
                        <SelectItem value="bureau_standard">Bureau Standard</SelectItem>
                        <SelectItem value="internal_rule">Internal Rule</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label>
                    Province
                    <Input
                      value={regulationForm.provinceOrTerritory}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, provinceOrTerritory: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Body
                    <Input
                      value={regulationForm.regulatorOrStandardBody}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, regulatorOrStandardBody: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Regulation
                    <Input
                      value={regulationForm.regulationName}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, regulationName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Statute or Rule
                    <Input
                      value={regulationForm.statuteOrRuleName}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, statuteOrRuleName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Section
                    <Input
                      value={regulationForm.sectionNumber}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, sectionNumber: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Subsection
                    <Input
                      value={regulationForm.subsectionNumber}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, subsectionNumber: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Citation Source
                    <Input
                      value={regulationForm.citationSource}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, citationSource: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Citation URL
                    <Input
                      value={regulationForm.citationUrl}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, citationUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Confidence
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={regulationForm.citationConfidence}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, citationConfidence: event.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.fullSpan}>
                    Excerpt
                    <Textarea
                      rows={3}
                      value={regulationForm.regulationTextExcerpt}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, regulationTextExcerpt: event.target.value }))
                      }
                    />
                  </label>
                  <label className={styles.checkboxLabel}>
                    <Checkbox
                      checked={regulationForm.adminVerifiedCitation}
                      onChange={(event) =>
                        setRegulationForm((prev) => ({ ...prev, adminVerifiedCitation: event.target.checked }))
                      }
                    />
                    Verified
                  </label>
                </div>
                <Button variant="outline" size="sm" onClick={() => addRegulationReference()} disabled={updateRegulation.isPending}>
                  <Link2 size={16} /> Link reference
                </Button>
                <div className={styles.linkedList}>
                  {activeCorrection?.regulationReferences.map((item) => (
                    <div key={item.id} className={styles.linkedItem} data-muted={item.mappingStatus === "incorrect"}>
                      <div>
                        <strong>{item.regulationName}</strong>
                        <span>{item.statuteOrRuleName} · {item.sectionNumber}</span>
                        <span>{authorityLabelForSavedReference(item)}</span>
                        <p>{item.regulationTextExcerpt}</p>
                      </div>
                      <div className={styles.inlineActions}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => updateReferenceStatus(item.id, item.mappingStatus === "incorrect" ? "active" : "incorrect", item.adminVerifiedCitation)}
                          title={item.mappingStatus === "incorrect" ? "Mark active" : "Mark incorrect"}
                        >
                          <Trash2 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => updateReferenceStatus(item.id, item.mappingStatus === "incorrect" ? "incorrect" : "active", !item.adminVerifiedCitation)}
                          title={item.adminVerifiedCitation ? "Unverify citation" : "Verify citation"}
                        >
                          <CheckCircle2 size={14} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => removeReference(item.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
