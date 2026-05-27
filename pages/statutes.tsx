import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import {
  Plus,
  Filter,
  Search,
  ExternalLink,
  Archive,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
  Star,
  BellRing,
  FileDown,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { format } from "../helpers/dateUtils";

import {
  useStatutes,
  useCreateStatute,
  useUpdateStatute,
  useStatuteFilterOptions,
  useStatuteHistory,
  useLegalAuthoritySearch,
} from "../helpers/statuteQueries";
import { useAuth } from "../helpers/useAuth";
import { OutputType as ListOutputType } from "../endpoints/statute/list_GET.schema";
import { Skeleton } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { StatuteFormDialog } from "../components/StatuteFormDialog";
import { StatuteStats } from "../components/StatuteStats";
import { HelpTooltip } from "../components/HelpTooltip";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";

import { useToast } from "../helpers/useToast";
import * as Dialog from "@radix-ui/react-dialog";
import { Input } from "../components/Input";
import styles from "./statutes.module.css";

type StatuteData = ListOutputType["statutes"][number];
type SortField =
  | "jurisdiction"
  | "code"
  | "version"
  | "effectiveDate"
  | "responseClockDays"
  | "packetCount"
  | "obligationCount"
  | "createdAt"
  | "lastReviewedAt";
type SortDirection = "asc" | "desc";
type LifecycleStatus = "ACTIVE" | "AMENDED" | "REPEALED";
type DateSortField = "effectiveDate" | "createdAt" | "lastReviewedAt";
type StatuteFormValues = Parameters<
  React.ComponentProps<typeof StatuteFormDialog>["onSubmit"]
>[0];

const WATCHLIST_KEY = "statute-watchlist-v1";
const WATCHLIST_SEEN_KEY = "statute-watchlist-seen-v1";
const DEFAULT_LIFECYCLE_STATUSES: LifecycleStatus[] = ["ACTIVE", "AMENDED", "REPEALED"];

function getLifecycleBadgeVariant(status: LifecycleStatus) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "AMENDED":
      return "warning" as const;
    case "REPEALED":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function escapeHtml(value: unknown): string {
  const safeValue = String(value ?? "");
  return safeValue
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isDateSortField(field: SortField): field is DateSortField {
  return field === "effectiveDate" || field === "createdAt" || field === "lastReviewedAt";
}

function normalizeSortValue(value: unknown, field: SortField): string | number {
  if (isDateSortField(field)) {
    return value ? new Date(value as string | Date).getTime() : 0;
  }
  return typeof value === "number" ? value : String(value);
}

export default function StatutesPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();

  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [status, setStatus] = useState<LifecycleStatus>("ACTIVE");
  const [topic, setTopic] = useState<string>("");
  const [includeSuperseded, setIncludeSuperseded] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>("");
  const [citation, setCitation] = useState<string>("");

  const [sortField, setSortField] = useState<SortField>("jurisdiction");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [historyVersionId, setHistoryVersionId] = useState<number | null>(null);
  const [historyLabel, setHistoryLabel] = useState<string>("");

  const [watchedVersionIds, setWatchedVersionIds] = useState<Set<number>>(new Set());
  const [seenReviewedAtByVersion, setSeenReviewedAtByVersion] = useState<Record<string, string>>({});

  const { data: filterOptions } = useStatuteFilterOptions();
  const effectiveIncludeSuperseded = includeSuperseded || status !== "ACTIVE";
  const { data, isFetching, error } = useStatutes({
    jurisdiction: jurisdiction || undefined,
    code: code || undefined,
    status,
    topic: topic || undefined,
    citation: citation || undefined,
    includeSuperseded: effectiveIncludeSuperseded,
    searchText: searchText || undefined,
  });
  const { data: historyData, isFetching: historyLoading } = useStatuteHistory(
    historyVersionId ?? undefined
  );
  const authorityQuery = searchText.trim();
  const { data: authorityData, isFetching: authorityLoading } = useLegalAuthoritySearch({
    query: authorityQuery || undefined,
    jurisdiction: jurisdiction || undefined,
    limit: 8,
  });

  const createMutation = useCreateStatute();
  const updateMutation = useUpdateStatute();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    if (authState.type === "unauthenticated") {
      navigate("/login");
    } else if (
      authState.type === "authenticated" &&
      authState.user.role !== "admin"
    ) {
      navigate("/");
    }
  }, [authState, navigate]);

  useEffect(() => {
    try {
      const storedWatch = localStorage.getItem(WATCHLIST_KEY);
      const storedSeen = localStorage.getItem(WATCHLIST_SEEN_KEY);
      if (storedWatch) {
        const parsed = JSON.parse(storedWatch);
        if (Array.isArray(parsed)) {
          setWatchedVersionIds(new Set(parsed.filter((v) => Number.isFinite(v))));
        }
      }
      if (storedSeen) {
        const parsedSeen = JSON.parse(storedSeen);
        if (parsedSeen && typeof parsedSeen === "object") {
          setSeenReviewedAtByVersion(parsedSeen);
        }
      }
    } catch {
      // ignore storage parsing errors
    }
  }, []);

  const persistWatchState = (nextWatchSet: Set<number>, nextSeen: Record<string, string>) => {
    setWatchedVersionIds(nextWatchSet);
    setSeenReviewedAtByVersion(nextSeen);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(nextWatchSet)));
    localStorage.setItem(WATCHLIST_SEEN_KEY, JSON.stringify(nextSeen));
  };

  const toggleWatch = (statute: StatuteData) => {
    const nextWatch = new Set(watchedVersionIds);
    const nextSeen = { ...seenReviewedAtByVersion };
    if (nextWatch.has(statute.versionId)) {
      nextWatch.delete(statute.versionId);
      delete nextSeen[String(statute.versionId)];
    } else {
      nextWatch.add(statute.versionId);
      if (statute.lastReviewedAt) {
        nextSeen[String(statute.versionId)] = new Date(statute.lastReviewedAt).toISOString();
      }
    }
    persistWatchState(nextWatch, nextSeen);
  };

  const markWatchSeen = (statute: StatuteData) => {
    if (!watchedVersionIds.has(statute.versionId) || !statute.lastReviewedAt) return;
    const nextSeen = {
      ...seenReviewedAtByVersion,
      [String(statute.versionId)]: new Date(statute.lastReviewedAt).toISOString(),
    };
    persistWatchState(new Set(watchedVersionIds), nextSeen);
  };

  const hasWatchUpdate = useCallback((statute: StatuteData) => {
    if (!watchedVersionIds.has(statute.versionId)) return false;
    if (!statute.lastReviewedAt) return false;
    const seen = seenReviewedAtByVersion[String(statute.versionId)];
    if (!seen) return true;
    return new Date(statute.lastReviewedAt).getTime() > new Date(seen).getTime();
  }, [watchedVersionIds, seenReviewedAtByVersion]);

  const filteredAndSortedStatutes = useMemo(() => {
    const statutes = Array.isArray(data?.statutes) ? data.statutes : [];
    if (statutes.length === 0) return [];

    const filtered = [...statutes];
    filtered.sort((a, b) => {
      const aRaw = a[sortField];
      const bRaw = b[sortField];

      if (aRaw === null || aRaw === undefined) return 1;
      if (bRaw === null || bRaw === undefined) return -1;

      const aVal = normalizeSortValue(aRaw, sortField);
      const bVal = normalizeSortValue(bRaw, sortField);

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data, sortField, sortDirection]);

  const groupedStatutes = useMemo(() => {
    const groups: Record<string, Record<string, StatuteData[]>> = {};
    filteredAndSortedStatutes.forEach((statute) => {
      if (!groups[statute.jurisdiction]) groups[statute.jurisdiction] = {};
      if (!groups[statute.jurisdiction][statute.code]) groups[statute.jurisdiction][statute.code] = [];
      groups[statute.jurisdiction][statute.code].push(statute);
    });
    return groups;
  }, [filteredAndSortedStatutes]);

  const watchedUpdates = useMemo(() => {
    return filteredAndSortedStatutes.filter((statute) => hasWatchUpdate(statute));
  }, [filteredAndSortedStatutes, hasWatchUpdate]);

  const relatedLawsByVersionId = useMemo(() => {
    const map = new Map<number, StatuteData[]>();
    for (const statute of filteredAndSortedStatutes) {
      const related = filteredAndSortedStatutes
        .filter(
          (candidate) =>
            candidate.versionId !== statute.versionId &&
            candidate.jurisdiction === statute.jurisdiction &&
            candidate.code !== statute.code
        )
        .slice(0, 3);
      map.set(statute.versionId, related);
    }
    return map;
  }, [filteredAndSortedStatutes]);

  const jurisdictionOptions = Array.isArray(filterOptions?.jurisdictions)
    ? filterOptions.jurisdictions
    : [];
  const codeOptions = Array.isArray(filterOptions?.codes) ? filterOptions.codes : [];
  const topicOptions = Array.isArray(filterOptions?.topics) ? filterOptions.topics : [];
  const lifecycleOptions = Array.isArray(filterOptions?.statuses)
    ? filterOptions.statuses
    : DEFAULT_LIFECYCLE_STATUSES;

  if (authState.type === "loading") {
    return (
      <div className={styles.container}>
        <Skeleton className={styles.skeletonRow} style={{ height: "200px" }} />
        <Skeleton className={styles.skeletonRow} style={{ marginTop: "2rem" }} />
      </div>
    );
  }

  if (authState.type !== "authenticated" || authState.user.role !== "admin") {
    return null;
  }

  const handleCreate = async (formData: StatuteFormValues) => {
    try {
      await createMutation.mutateAsync({
        ...formData,
        code: (formData.code || "").toUpperCase().trim(),
        effectiveDate: new Date(formData.effectiveDate),
      });
      showSuccess("Law version created", {
        description: "Metadata has been validated and the version is now available.",
      });
    } catch (e) {
      showError("Failed to create law version");
      console.error(e);
    }
  };

  const handleMarkSuperseded = async (statute: StatuteData) => {
    try {
      await updateMutation.mutateAsync({
        versionId: statute.versionId,
        supersededDate: new Date(),
      });
      showSuccess("Marked as superseded");
    } catch (e) {
      showError("Failed to mark as superseded");
      console.error(e);
    }
  };

  const handleMarkReviewed = async (statute: StatuteData) => {
    try {
      await updateMutation.mutateAsync({
        versionId: statute.versionId,
        markReviewed: true,
      });
      showSuccess("Law version marked as reviewed");
    } catch (e) {
      showError("Failed to mark as reviewed");
      console.error(e);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className={styles.sortIcon} />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp size={14} className={styles.sortIconActive} />
    ) : (
      <ArrowDown size={14} className={styles.sortIconActive} />
    );
  };

  const handleExportCsv = () => {
    const headers = [
      "Jurisdiction",
      "Code",
      "Version",
      "Citation",
      "Topic",
      "Status",
      "Description",
      "EffectiveDate",
      "LastReviewedAt",
      "SourceUrl",
      "ResponseClockDays",
      "PacketCount",
      "ObligationCount",
    ];

    const rows = filteredAndSortedStatutes.map((s) => [
      s.jurisdiction,
      s.code,
      `v${s.version}`,
      s.citation || "",
      s.topic || "",
      s.lifecycleStatus,
      s.description || "",
      s.effectiveDate ? new Date(s.effectiveDate).toISOString() : "",
      s.lastReviewedAt ? new Date(s.lastReviewedAt).toISOString() : "",
      s.sourceUrl || "",
      s.responseClockDays ?? "",
      s.packetCount,
      s.obligationCount,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laws-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleExportPdf = () => {
    const htmlRows = filteredAndSortedStatutes
      .map(
        (s) => `
        <tr>
          <td>${escapeHtml(s.jurisdiction)}</td>
          <td>${escapeHtml(s.code)}</td>
          <td>v${s.version}</td>
          <td>${escapeHtml(s.citation || "")}</td>
          <td>${escapeHtml(s.topic || "")}</td>
          <td>${escapeHtml(s.lifecycleStatus)}</td>
          <td>${escapeHtml(s.description || "")}</td>
          <td>${s.effectiveDate ? escapeHtml(format(new Date(s.effectiveDate), "yyyy-MM-dd")) : ""}</td>
        </tr>
      `
      )
      .join("");

    const htmlDocument = `
      <html>
        <head>
          <title>Laws Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Laws Export</h1>
          <table>
            <thead>
              <tr>
                <th>Jurisdiction</th>
                <th>Code</th>
                <th>Version</th>
                <th>Citation</th>
                <th>Topic</th>
                <th>Status</th>
                <th>Description</th>
                <th>Effective Date</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlDocument);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
      return;
    }

    // Fallback for popup-blocked environments (including in-app browsers).
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    };

    const iframeDocument = iframe.contentDocument;
    if (!iframeDocument) {
      showError("Unable to render PDF preview");
      cleanup();
      return;
    }

    iframeDocument.open();
    iframeDocument.write(htmlDocument);
    iframeDocument.close();

    const printFromFrame = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        showError("Unable to render PDF preview");
        cleanup();
        return;
      }
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    if (iframeDocument.readyState === "complete") {
      setTimeout(printFromFrame, 100);
    } else {
      iframe.onload = () => setTimeout(printFromFrame, 100);
    }
  };

  const openHistory = (statute: StatuteData) => {
    setHistoryVersionId(statute.versionId);
    setHistoryLabel(`${statute.jurisdiction} ${statute.code} v${statute.version}`);
    markWatchSeen(statute);
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Laws Registry | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title={
          <div className={styles.titleWrapper}>
            Laws Registry
            <HelpTooltip
              content={
                <>
                  <p>
                    Laws define the legal frameworks and obligations used by the platform.
                  </p>
                  <p style={{ marginTop: "0.5rem" }}>
                    Active laws require citation, source URL, effective date, and review history.
                  </p>
                </>
              }
              title="About Laws"
            />
          </div>
        }
        subtitle="Manage canonical law versions with status lifecycle, source traceability, and review history."
        role={authState.user.role}
      >
        <Button variant="outline" onClick={handleExportCsv}>
          <FileDown size={16} />
          Export CSV
        </Button>
        <Button variant="outline" onClick={handleExportPdf}>
          <FileText size={16} />
          Export PDF
        </Button>
        <button className={styles.createButton} onClick={() => setIsCreateOpen(true)}>
          <Plus size={18} />
          Create Law Version
        </button>
      </PageHeader>

      {watchedUpdates.length > 0 && (
        <div className={styles.watchAlert}>
          <BellRing size={16} />
          <span>
            {watchedUpdates.length} watched law version
            {watchedUpdates.length > 1 ? "s have" : " has"} new updates.
          </span>
        </div>
      )}

      <StatuteStats />

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filterLabel}>
            Filters
            <HelpTooltip
              content="Filter by jurisdiction, code, topic, and lifecycle status. Citation filter is exact-match."
              side="right"
            />
          </div>
          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
            <Input
              type="text"
              placeholder="Search description, code, section..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
            <Input
              type="text"
              placeholder="Exact citation (e.g., CRA Section 12)"
              value={citation}
              onChange={(e) => setCitation(e.target.value)}
              className={styles.citationInput}
            />
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select className={styles.select} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
              <option value="">All Jurisdictions</option>
              {jurisdictionOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select className={styles.select} value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">All Codes</option>
              {codeOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select className={styles.select} value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All Topics</option>
              {topicOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as LifecycleStatus)}
            >
              {lifecycleOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={includeSuperseded}
              onChange={(e) => setIncludeSuperseded(e.target.checked)}
            />
            <span className={styles.toggleLabel}>Include Superseded Records</span>
          </label>
        </div>
      </div>

      {authorityQuery && (
        <section className={styles.authorityPanel}>
          <div className={styles.authorityHeader}>
            <div>
              <h2 className={styles.authorityTitle}>Local Authority Matches</h2>
              <p className={styles.authorityMeta}>
                {authorityLoading ? "Searching local authority records" : `${authorityData?.authorities.length ?? 0} matches`}
              </p>
            </div>
            <Badge variant="info">Local corpus</Badge>
          </div>
          {!authorityLoading && authorityData?.authorities.length === 0 ? (
            <div className={styles.authorityEmpty}>No local authority records match this search.</div>
          ) : (
            <div className={styles.authorityList}>
              {(authorityData?.authorities ?? []).map((authority) => (
                <article key={authority.id} className={styles.authorityItem}>
                  <div className={styles.authorityItemHeader}>
                    <div>
                      <div className={styles.authorityCitation}>
                        {authority.statute} · {authority.citation}
                      </div>
                      <div className={styles.authorityLabel}>{authority.shortLabel}</div>
                    </div>
                    <Badge variant={authority.allowsFieldRequiredLanguage ? "success" : "default"}>
                      {authority.supportLevel.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className={styles.authorityExcerpt}>{authority.textExcerpt}</p>
                  <div className={styles.authorityFooter}>
                    <span>{authority.regulationId}</span>
                    <span>{authority.sourceQuality}</span>
                    {authority.sourceUrl && (
                      <a href={authority.sourceUrl} target="_blank" rel="noreferrer">
                        Source <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className={styles.content}>
        {isFetching ? (
          <div className={styles.loading}>
            <Skeleton className={styles.skeletonRow} />
            <Skeleton className={styles.skeletonRow} />
            <Skeleton className={styles.skeletonRow} />
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <AlertTriangle size={32} />
            <p>
              Failed to load laws.
              {error instanceof Error && error.message
                ? ` ${error.message}`
                : " Please try again."}
            </p>
          </div>
        ) : Object.keys(groupedStatutes).length === 0 ? (
          <div className={styles.emptyState}>
            <p>No laws found matching your filters.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => handleSort("jurisdiction")} className={styles.sortable}>
                    Jurisdiction / Code {getSortIcon("jurisdiction")}
                  </th>
                  <th onClick={() => handleSort("version")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Ver {getSortIcon("version")}
                  </th>
                  <th>Citation</th>
                  <th>Description</th>
                  <th onClick={() => handleSort("responseClockDays")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Clock {getSortIcon("responseClockDays")}
                  </th>
                  <th onClick={() => handleSort("effectiveDate")} className={styles.sortable}>
                    Effective {getSortIcon("effectiveDate")}
                  </th>
                  <th onClick={() => handleSort("lastReviewedAt")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Last Reviewed {getSortIcon("lastReviewedAt")}
                  </th>
                  <th className={styles.hideOnMobile}>Topic</th>
                  <th>Status</th>
                  <th className={styles.actionsHeader}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedStatutes).map(([jur, codes]) =>
                  Object.entries(codes).map(([c, statutes]) => (
                    <React.Fragment key={`${jur}-${c}`}>
                      <tr className={styles.groupHeader}>
                        <td colSpan={10}>
                          {jur} <span className={styles.codeBadge}>{c}</span>
                        </td>
                      </tr>
                      {statutes.map((statute) => {
                        const related = relatedLawsByVersionId.get(statute.versionId) || [];
                        return (
                          <tr key={statute.versionId} className={styles.row}>
                            <td className={styles.indent}>
                              <div className={styles.citation}>{statute.code}</div>
                            </td>
                            <td className={styles.hideOnMobile}>v{statute.version}</td>
                            <td>
                              <div className={styles.citationBlock}>
                                <div className={styles.citation}>{statute.citation || "-"}</div>
                                {related.length > 0 && (
                                  <div className={styles.relatedLaws}>
                                    Related:{" "}
                                    {related.map((law) => `${law.code} v${law.version}`).join(", ")}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className={styles.descriptionCell}>
                              <div className={styles.description} title={statute.description || ""}>
                                {statute.description}
                              </div>
                            </td>
                            <td className={styles.hideOnMobile}>{statute.responseClockDays} days</td>
                            <td>
                              {statute.effectiveDate
                                ? format(new Date(statute.effectiveDate), "MMM d, yyyy")
                                : "-"}
                            </td>
                            <td className={styles.hideOnMobile}>
                              {statute.lastReviewedAt
                                ? format(new Date(statute.lastReviewedAt), "MMM d, yyyy")
                                : "-"}
                            </td>
                            <td className={styles.hideOnMobile}>
                              <Badge variant="info">{statute.topic}</Badge>
                            </td>
                            <td>
                              <Badge variant={getLifecycleBadgeVariant(statute.lifecycleStatus)}>
                                {statute.lifecycleStatus}
                              </Badge>
                            </td>
                            <td>
                              <div className={styles.actions}>
                                <button
                                  className={`${styles.actionButton} ${
                                    watchedVersionIds.has(statute.versionId) ? styles.actionActive : ""
                                  }`}
                                  onClick={() => toggleWatch(statute)}
                                  title="Watch this law version"
                                >
                                  <Star size={16} />
                                  {hasWatchUpdate(statute) && <span className={styles.updateDot} />}
                                </button>

                                <button
                                  className={styles.actionButton}
                                  onClick={() => openHistory(statute)}
                                  title="View change history"
                                >
                                  <History size={16} />
                                </button>

                                <button
                                  className={styles.actionButton}
                                  onClick={() => handleMarkReviewed(statute)}
                                  title="Mark as reviewed"
                                >
                                  <CheckCircle2 size={16} />
                                </button>

                                {statute.lifecycleStatus === "ACTIVE" && (
                                  <button
                                    className={styles.actionButton}
                                    onClick={() => handleMarkSuperseded(statute)}
                                    title="Mark as superseded"
                                  >
                                    <Archive size={16} />
                                  </button>
                                )}

                                {statute.sourceUrl && (
                                  <a
                                    href={statute.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.actionButton}
                                    title="View official source"
                                  >
                                    <ExternalLink size={16} />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StatuteFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      <Dialog.Root open={historyVersionId !== null} onOpenChange={(open) => !open && setHistoryVersionId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.historyOverlay} />
          <Dialog.Content className={styles.historyDialog}>
            <Dialog.Title className={styles.historyTitle}>Change History: {historyLabel}</Dialog.Title>
            <div className={styles.historyBody}>
              {historyLoading ? (
                <>
                  <Skeleton className={styles.skeletonRow} />
                  <Skeleton className={styles.skeletonRow} />
                </>
              ) : !historyData?.history || historyData.history.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No history entries found for this law version.</p>
                </div>
              ) : (
                historyData.history.map((entry) => (
                  <div key={entry.auditLogId} className={styles.historyRow}>
                    <div className={styles.historyMeta}>
                      <Badge variant="info">{entry.mode || entry.actionType}</Badge>
                      <span>
                        {format(new Date(entry.timestamp), "MMM d, yyyy h:mm a")}
                      </span>
                      <span>{entry.userDisplayName || entry.userEmail || "System"}</span>
                    </div>
                    <div className={styles.historyFields}>
                      {entry.changedFields.length > 0
                        ? `Changed: ${entry.changedFields.join(", ")}`
                        : "No field-level diff recorded"}
                    </div>
                    {entry.citation && <div className={styles.historyFields}>Citation: {entry.citation}</div>}
                  </div>
                ))
              )}
            </div>
            <div className={styles.historyActions}>
              <Button variant="outline" onClick={() => setHistoryVersionId(null)}>
                Close
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
