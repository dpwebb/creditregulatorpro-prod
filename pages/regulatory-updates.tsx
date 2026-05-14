import { FormEvent, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Check,
  Database,
  ExternalLink,
  FilePlus2,
  Filter,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { format } from "../helpers/dateUtils";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { CANADIAN_JURISDICTIONS } from "../helpers/canadianJurisdictions";
import {
  RegulationCategoryArrayValues,
  ViolationCategoryArrayValues,
  type RegulationCategory,
  type ViolationCategory,
} from "../helpers/schema";
import {
  useCreateRegulationCandidate,
  useDeactivateRegulation,
  useRebuildRegulationIndex,
  useRegulationCandidates,
  useRegulationMappings,
  useRegulationRegistry,
  useRestoreRegulation,
  useReviewRegulationCandidate,
  useSaveRegulationMapping,
  useScanRegulationRegistry,
} from "../helpers/useRegulationRegistry";
import type { RegulationRegistryRow } from "../endpoints/regulation-registry/list_GET.schema";
import type { RegulationCandidateRow } from "../endpoints/regulation-registry/candidates_GET.schema";
import { RegulationReconciliationCandidatesTab } from "../components/RegulationReconciliationCandidatesTab";
import { RegulationRuntimeBridgeMappingsTab } from "../components/RegulationRuntimeBridgeMappingsTab";
import styles from "./regulatory-updates.module.css";

type DraftForm = {
  regulationId: string;
  jurisdiction: string;
  authoritySource: string;
  regulationTitle: string;
  sectionNumber: string;
  subsection: string;
  shortTitle: string;
  fullText: string;
  plainLanguageSummary: string;
  officialSourceUrl: string;
  publicationDate: string;
  effectiveDate: string;
  repealSupersededStatus: string;
  regulationCategory: RegulationCategory;
  tags: string;
  citationFormat: string;
  sourceDocumentUrl: string;
};

const EMPTY_DRAFT: DraftForm = {
  regulationId: "",
  jurisdiction: "Federal",
  authoritySource: "",
  regulationTitle: "",
  sectionNumber: "",
  subsection: "",
  shortTitle: "",
  fullText: "",
  plainLanguageSummary: "",
  officialSourceUrl: "",
  publicationDate: "",
  effectiveDate: "",
  repealSupersededStatus: "current",
  regulationCategory: "credit_reporting",
  tags: "",
  citationFormat: "",
  sourceDocumentUrl: "",
};

function formatEnum(value: string): string {
  return value.replace(/_/g, " ");
}

function formatDate(value: Date | string | null): string {
  return value ? format(value, "MMM d, yyyy") : "-";
}

function confidenceLabel(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0%";
  return `${Math.round(numeric * 100)}%`;
}

function diffOf(candidate: RegulationCandidateRow) {
  const diff = (candidate.diffReport ?? {}) as {
    summary?: string;
    oldSnippet?: string | null;
    newSnippet?: string | null;
  };
  return diff;
}

function statusVariant(status: string) {
  if (status === "active" || status === "approved") return "success";
  if (status === "pending_review" || status === "ambiguous" || status === "possible_duplicate") return "warning";
  if (status === "rejected" || status === "inactive") return "default";
  return "info";
}

export default function RegulatoryUpdatesPage() {
  const [search, setSearch] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [category, setCategory] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [mappingDraft, setMappingDraft] = useState({
    violationCategory: "ACCOUNT_STATUS_INCONSISTENCY" as ViolationCategory,
    regulationId: "",
    regulationRecordId: "",
    sectionNumber: "",
    subsection: "",
    jurisdiction: "Federal",
    explanationTemplate: "",
  });

  const registryQuery = useRegulationRegistry({
    search: search || undefined,
    jurisdiction: jurisdiction || undefined,
    category: (category as RegulationCategory) || undefined,
    includeInactive,
  });
  const candidateQuery = useRegulationCandidates({ status: "pending_review" });
  const mappingQuery = useRegulationMappings();

  const createCandidate = useCreateRegulationCandidate();
  const reviewCandidate = useReviewRegulationCandidate();
  const deactivateRegulation = useDeactivateRegulation();
  const restoreRegulation = useRestoreRegulation();
  const rebuildIndex = useRebuildRegulationIndex();
  const scanRegistry = useScanRegulationRegistry();
  const saveMapping = useSaveRegulationMapping();

  const registry = registryQuery.data?.regulations ?? [];
  const candidates = candidateQuery.data?.candidates ?? [];
  const mappings = mappingQuery.data?.mappings ?? [];

  const stats = useMemo(() => {
    return {
      active: registry.filter((row) => row.activeStatus === "active").length,
      pending: candidates.length,
      mapped: mappings.length,
    };
  }, [registry, candidates.length, mappings.length]);

  const selectedMappingRegulation = registry.find((row) => row.regulationId === mappingDraft.regulationId);

  const submitDraft = async (event: FormEvent) => {
    event.preventDefault();
    await createCandidate.mutateAsync({
      regulationId: draft.regulationId,
      jurisdiction: draft.jurisdiction,
      authoritySource: draft.authoritySource,
      regulationTitle: draft.regulationTitle,
      sectionNumber: draft.sectionNumber,
      subsection: draft.subsection || null,
      shortTitle: draft.shortTitle,
      fullText: draft.fullText,
      plainLanguageSummary: draft.plainLanguageSummary,
      officialSourceUrl: draft.officialSourceUrl,
      publicationDate: draft.publicationDate ? new Date(draft.publicationDate) : null,
      effectiveDate: draft.effectiveDate ? new Date(draft.effectiveDate) : null,
      repealSupersededStatus: draft.repealSupersededStatus || "current",
      regulationCategory: draft.regulationCategory,
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      citationFormat: draft.citationFormat,
      sourceDocumentUrl: draft.sourceDocumentUrl || null,
    });
    setDraft(EMPTY_DRAFT);
  };

  const submitMapping = async (event: FormEvent) => {
    event.preventDefault();
    await saveMapping.mutateAsync({
      violationCategory: mappingDraft.violationCategory,
      regulationId: mappingDraft.regulationId,
      regulationRecordId: mappingDraft.regulationRecordId ? Number(mappingDraft.regulationRecordId) : selectedMappingRegulation?.id ?? null,
      sectionNumber: mappingDraft.sectionNumber,
      subsection: mappingDraft.subsection || null,
      jurisdiction: mappingDraft.jurisdiction,
      explanationTemplate: mappingDraft.explanationTemplate,
      active: true,
    });
    setMappingDraft({
      violationCategory: "ACCOUNT_STATUS_INCONSISTENCY",
      regulationId: "",
      regulationRecordId: "",
      sectionNumber: "",
      subsection: "",
      jurisdiction: "Federal",
      explanationTemplate: "",
    });
  };

  const updateDraft = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Regulations | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Regulations & Law Update Engine"
        subtitle="Controlled registry for sourced, versioned, admin-approved regulatory references."
      >
        <div className={styles.headerActions}>
          <Button
            onClick={() => scanRegistry.mutate({ mode: "assisted", fetchConfiguredSources: true, sourceDocuments: [] })}
            variant="secondary"
            disabled={scanRegistry.isPending}
          >
            <RefreshCw size={18} />
            {scanRegistry.isPending ? "Scanning..." : "Run Source Check"}
          </Button>
          <Button onClick={() => rebuildIndex.mutate()} variant="secondary" disabled={rebuildIndex.isPending}>
            <Database size={18} />
            {rebuildIndex.isPending ? "Rebuilding..." : "Rebuild Indexes"}
          </Button>
        </div>
      </PageHeader>

      <div className={styles.safetyBanner}>
        <ShieldCheck size={18} />
        <span>No regulation becomes active truth until an admin approves a sourced candidate. AI scans and automatic rule generation are disabled.</span>
      </div>

      <div className={styles.statsContainer}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Regulations</div>
          <div className={styles.statValue}>{registryQuery.isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.active}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Pending Review</div>
          <div className={styles.statValue}>{candidateQuery.isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.pending}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Violation Mappings</div>
          <div className={styles.statValue}>{mappingQuery.isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.mapped}</div>
        </div>
      </div>

      <Tabs defaultValue="registry" className={styles.tabsContainer}>
        <TabsList>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="pending">Pending Updates</TabsTrigger>
          <TabsTrigger value="manual">Manual Add</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="reconciliation-candidates">Reconciliation Candidates</TabsTrigger>
          <TabsTrigger value="runtime-bridge-mappings">Runtime Bridge Mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="registry">
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <div className={styles.filterGroup}>
                <Search size={16} className={styles.filterIcon} />
                <input className={styles.inputInline} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search regulations" />
              </div>
              <div className={styles.filterGroup}>
                <Filter size={16} className={styles.filterIcon} />
                <select className={styles.select} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}>
                  <option value="">All Jurisdictions</option>
                  {CANADIAN_JURISDICTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className={styles.filterGroup}>
                <select className={styles.select} value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All Categories</option>
                  {RegulationCategoryArrayValues.map((item) => <option key={item} value={item}>{formatEnum(item)}</option>)}
                </select>
              </div>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
                Include inactive
              </label>
            </div>
          </div>

          {registryQuery.isLoading ? (
            <div className={styles.loading}><Skeleton className={styles.skeletonRow} /><Skeleton className={styles.skeletonRow} /></div>
          ) : registry.length === 0 ? (
            <div className={styles.emptyState}>No approved regulation records match the current filters.</div>
          ) : (
            <div className={styles.cardList}>
              {registry.map((regulation: RegulationRegistryRow) => (
                <article key={regulation.id} className={styles.updateCard}>
                  <div className={styles.cardTopRow}>
                    <Badge variant={statusVariant(regulation.activeStatus)}>{regulation.activeStatus}</Badge>
                    <Badge variant="default">v{regulation.updateVersion}</Badge>
                    <span className={styles.jurisdictionText}>{regulation.jurisdiction}</span>
                    <span className={styles.reference}>{formatEnum(regulation.regulationCategory)}</span>
                    <span className={styles.dateText}>Approved {formatDate(regulation.approvedAt)}</span>
                  </div>
                  <div className={styles.cardBottomRow}>
                    <div className={styles.cardTitleSection}>
                      <div className={styles.title}>{regulation.regulationTitle}</div>
                      <div className={styles.reference}>{regulation.citationFormat}</div>
                      <p className={styles.description}>{regulation.plainLanguageSummary}</p>
                      <div className={styles.metaLine}>
                        <span>Confidence {confidenceLabel(regulation.confidenceScore)}</span>
                        <span>{regulation.mappingCount} mapped violation{regulation.mappingCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <a className={styles.actionButton} href={regulation.officialSourceUrl} target="_blank" rel="noopener noreferrer" title="Open source">
                        <ExternalLink size={16} />
                      </a>
                      {regulation.activeStatus === "active" ? (
                        <button className={styles.actionButton} onClick={() => deactivateRegulation.mutate({ recordId: regulation.id, reason: "Admin deactivated from registry dashboard" })} title="Deactivate">
                          <X size={16} />
                        </button>
                      ) : (
                        <button className={styles.actionButton} onClick={() => restoreRegulation.mutate({ recordId: regulation.id, reason: "Admin restored prior approved version" })} title="Restore version">
                          <Undo2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending">
          {candidateQuery.isLoading ? (
            <div className={styles.loading}><Skeleton className={styles.skeletonRow} /><Skeleton className={styles.skeletonRow} /></div>
          ) : candidates.length === 0 ? (
            <div className={styles.emptyState}>No regulation candidates are waiting for review.</div>
          ) : (
            <div className={styles.cardList}>
              {candidates.map((candidate: RegulationCandidateRow) => {
                const diff = diffOf(candidate);
                return (
                  <article key={candidate.id} className={styles.updateCard}>
                    <div className={styles.cardTopRow}>
                      <Badge variant={statusVariant(candidate.changeClassification)}>{formatEnum(candidate.changeClassification)}</Badge>
                      <span className={styles.jurisdictionText}>{candidate.jurisdiction}</span>
                      <span className={styles.reference}>Candidate v{candidate.proposedVersion}</span>
                      <span className={styles.dateText}>{formatDate(candidate.detectedAt)}</span>
                    </div>
                    <div className={styles.cardBottomRow}>
                      <div className={styles.cardTitleSection}>
                        <div className={styles.title}>{candidate.regulationTitle}</div>
                        <div className={styles.reference}>{candidate.citationFormat}</div>
                        <p className={styles.description}>{candidate.plainLanguageSummary}</p>
                        <div className={styles.compareGrid}>
                          <div>
                            <strong>Old</strong>
                            <p>{diff.oldSnippet || "No prior text."}</p>
                          </div>
                          <div>
                            <strong>New</strong>
                            <p>{diff.newSnippet || diff.summary || "No wording diff available."}</p>
                          </div>
                        </div>
                        {candidate.ambiguityReasons.length > 0 && (
                          <p className={styles.warningText}>{candidate.ambiguityReasons.join("; ")}</p>
                        )}
                        <textarea
                          className={styles.textareaInline}
                          value={reviewNotes[candidate.id] ?? ""}
                          onChange={(event) => setReviewNotes((current) => ({ ...current, [candidate.id]: event.target.value }))}
                          placeholder="Review notes"
                        />
                      </div>
                      <div className={styles.actions}>
                        <a className={styles.actionButton} href={candidate.officialSourceUrl} target="_blank" rel="noopener noreferrer" title="Open source">
                          <ExternalLink size={16} />
                        </a>
                        <button className={styles.actionButton} onClick={() => reviewCandidate.mutate({ candidateId: candidate.id, decision: "approve", reviewNotes: reviewNotes[candidate.id] || null })} title="Approve">
                          <Check size={16} />
                        </button>
                        <button className={styles.actionButton} onClick={() => reviewCandidate.mutate({ candidateId: candidate.id, decision: "reject", reviewNotes: reviewNotes[candidate.id] || null })} title="Reject">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual">
          <form className={styles.formPanel} onSubmit={submitDraft}>
            <div className={styles.formHeader}><FilePlus2 size={18} /><span>Add Sourced Regulation Candidate</span></div>
            <div className={styles.formGrid}>
              <input className={styles.input} value={draft.regulationId} onChange={(event) => updateDraft("regulationId", event.target.value)} placeholder="regulationId" required />
              <select className={styles.input} value={draft.jurisdiction} onChange={(event) => updateDraft("jurisdiction", event.target.value)}>
                {CANADIAN_JURISDICTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select className={styles.input} value={draft.regulationCategory} onChange={(event) => updateDraft("regulationCategory", event.target.value as RegulationCategory)}>
                {RegulationCategoryArrayValues.map((item) => <option key={item} value={item}>{formatEnum(item)}</option>)}
              </select>
              <input className={styles.input} value={draft.authoritySource} onChange={(event) => updateDraft("authoritySource", event.target.value)} placeholder="Authority/source" required />
              <input className={styles.input} value={draft.regulationTitle} onChange={(event) => updateDraft("regulationTitle", event.target.value)} placeholder="Regulation title" required />
              <input className={styles.input} value={draft.shortTitle} onChange={(event) => updateDraft("shortTitle", event.target.value)} placeholder="Short title" required />
              <input className={styles.input} value={draft.sectionNumber} onChange={(event) => updateDraft("sectionNumber", event.target.value)} placeholder="Section" required />
              <input className={styles.input} value={draft.subsection} onChange={(event) => updateDraft("subsection", event.target.value)} placeholder="Subsection" />
              <input className={styles.input} value={draft.citationFormat} onChange={(event) => updateDraft("citationFormat", event.target.value)} placeholder="Citation format" required />
              <input className={styles.input} value={draft.officialSourceUrl} onChange={(event) => updateDraft("officialSourceUrl", event.target.value)} placeholder="Official source URL" required />
              <input className={styles.input} value={draft.publicationDate} onChange={(event) => updateDraft("publicationDate", event.target.value)} type="date" />
              <input className={styles.input} value={draft.effectiveDate} onChange={(event) => updateDraft("effectiveDate", event.target.value)} type="date" />
              <input className={styles.input} value={draft.repealSupersededStatus} onChange={(event) => updateDraft("repealSupersededStatus", event.target.value)} placeholder="current / repealed / superseded" />
              <input className={styles.input} value={draft.tags} onChange={(event) => updateDraft("tags", event.target.value)} placeholder="Tags, comma-separated" />
            </div>
            <textarea className={styles.textarea} value={draft.plainLanguageSummary} onChange={(event) => updateDraft("plainLanguageSummary", event.target.value)} placeholder="Plain-language summary" required />
            <textarea className={styles.textareaLarge} value={draft.fullText} onChange={(event) => updateDraft("fullText", event.target.value)} placeholder="Full sourced text" required />
            <div className={styles.formActions}>
              <Button type="submit" variant="primary" disabled={createCandidate.isPending}>
                <FilePlus2 size={18} />
                {createCandidate.isPending ? "Adding..." : "Add Candidate"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="mappings">
          <form className={styles.formPanel} onSubmit={submitMapping}>
            <div className={styles.formHeader}><History size={18} /><span>Map Approved Regulation To Violation</span></div>
            <div className={styles.formGrid}>
              <select className={styles.input} value={mappingDraft.violationCategory} onChange={(event) => setMappingDraft((current) => ({ ...current, violationCategory: event.target.value as ViolationCategory }))}>
                {ViolationCategoryArrayValues.map((item) => <option key={item} value={item}>{formatEnum(item)}</option>)}
              </select>
              <select className={styles.input} value={mappingDraft.regulationId} onChange={(event) => {
                const selected = registry.find((row) => row.regulationId === event.target.value);
                setMappingDraft((current) => ({
                  ...current,
                  regulationId: event.target.value,
                  regulationRecordId: selected ? String(selected.id) : "",
                  sectionNumber: selected?.sectionNumber ?? current.sectionNumber,
                  subsection: selected?.subsection ?? "",
                  jurisdiction: selected?.jurisdiction ?? current.jurisdiction,
                }));
              }}>
                <option value="">Select active regulation</option>
                {registry.filter((row) => row.activeStatus === "active").map((row) => (
                  <option key={row.id} value={row.regulationId}>{row.regulationId} - {row.shortTitle}</option>
                ))}
              </select>
              <input className={styles.input} value={mappingDraft.sectionNumber} onChange={(event) => setMappingDraft((current) => ({ ...current, sectionNumber: event.target.value }))} placeholder="Section" required />
              <input className={styles.input} value={mappingDraft.subsection} onChange={(event) => setMappingDraft((current) => ({ ...current, subsection: event.target.value }))} placeholder="Subsection" />
            </div>
            <textarea className={styles.textarea} value={mappingDraft.explanationTemplate} onChange={(event) => setMappingDraft((current) => ({ ...current, explanationTemplate: event.target.value }))} placeholder="Explanation template" required />
            <div className={styles.formActions}>
              <Button type="submit" variant="primary" disabled={saveMapping.isPending}>
                <Check size={18} />
                {saveMapping.isPending ? "Saving..." : "Save Mapping"}
              </Button>
            </div>
          </form>

          <div className={styles.cardList}>
            {mappings.map((mapping: any) => (
              <article key={mapping.id} className={styles.updateCard}>
                <div className={styles.cardTopRow}>
                  <Badge variant={mapping.active ? "success" : "default"}>{mapping.active ? "active" : "inactive"}</Badge>
                  <span className={styles.jurisdictionText}>{mapping.violationCategory}</span>
                  <span className={styles.reference}>{mapping.regulationId}</span>
                </div>
                <p className={styles.description}>{mapping.explanationTemplate}</p>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reconciliation-candidates">
          <RegulationReconciliationCandidatesTab />
        </TabsContent>

        <TabsContent value="runtime-bridge-mappings">
          <RegulationRuntimeBridgeMappingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
