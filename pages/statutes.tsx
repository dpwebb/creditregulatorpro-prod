import React, { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { format } from "../helpers/dateUtils";

import {
  useStatutes,
  useCreateStatute,
  useUpdateStatute,
  useStatuteFilterOptions,
} from "../helpers/statuteQueries";
import { useAuth } from "../helpers/useAuth";
import { OutputType as ListOutputType } from "../endpoints/statute/list_GET.schema";
import { Skeleton } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { StatuteFormDialog } from "../components/StatuteFormDialog";
import { StatuteStats } from "../components/StatuteStats";
import { HelpTooltip } from "../components/HelpTooltip";
import { PageHeader } from "../components/PageHeader";


import { useToast } from "../helpers/useToast";
import * as Dialog from "@radix-ui/react-dialog";
import { Input } from "../components/Input";
import styles from "./statutes.module.css";

// Define the type for the combined statute data as returned by the list endpoint
type StatuteData = ListOutputType["statutes"][number];

type SortField = "jurisdiction" | "code" | "version" | "effectiveDate" | "responseClockDays" | "packetCount" | "obligationCount" | "createdAt";
type SortDirection = "asc" | "desc";

export default function StatutesPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  
  // Filters
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [includeSuperseded, setIncludeSuperseded] = useState<boolean>(false);
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("jurisdiction");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Queries & Mutations
  const { data: filterOptions } = useStatuteFilterOptions();
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

  const { data, isFetching, error } = useStatutes({
    jurisdiction: jurisdiction || undefined,
    code: code || undefined,
    includeSuperseded,
    searchText: searchText || undefined,
  });

  const createMutation = useCreateStatute();
  const updateMutation = useUpdateStatute();
  const { showSuccess, showError } = useToast();

  // Filter and sort statutes
  const filteredAndSortedStatutes = useMemo(() => {
    if (!data?.statutes) return [];

    let filtered = [...data.statutes];

    // Apply active-only filter (active = not superseded)
    if (activeOnly) {
      filtered = filtered.filter(s => !s.supersededDate);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle null values
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // Convert dates to timestamps for comparison
      if (sortField === "effectiveDate" || sortField === "createdAt") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data, activeOnly, sortField, sortDirection]);

  // Grouping Logic
  const groupedStatutes = useMemo(() => {
    const groups: Record<string, Record<string, StatuteData[]>> = {};
    
    filteredAndSortedStatutes.forEach((statute) => {
      if (!groups[statute.jurisdiction]) {
        groups[statute.jurisdiction] = {};
      }
      if (!groups[statute.jurisdiction][statute.code]) {
        groups[statute.jurisdiction][statute.code] = [];
      }
      groups[statute.jurisdiction][statute.code].push(statute);
    });

    return groups;
  }, [filteredAndSortedStatutes]);

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

  // Handlers
  const handleCreate = async (formData: any) => {
    try {
      await createMutation.mutateAsync({
        ...formData,
        effectiveDate: new Date(formData.effectiveDate),
      });
      showSuccess("Statute created successfully", {
        description: "The new statute version is now active and ready for use.",
      });
    } catch (e) {
      showError("Failed to create statute");
      console.error(e);
    }
  };


  const handleMarkSuperseded = async (statute: StatuteData) => {
    try {
      await updateMutation.mutateAsync({
        versionId: statute.versionId,
        supersededDate: new Date(),
      });
      showSuccess("Statute marked as superseded", {
        undo: () => {
          // Note: In a real app, we would implement restore functionality here
          // For now just showing the toast structure
          console.log("Undo not implemented yet");
        }
      });
    } catch (e) {
      showError("Failed to mark as superseded");
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

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Statute Management | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title={
          <div className={styles.titleWrapper}>
            Statute Management
            <HelpTooltip
              content={
                <>
                  <p>
                    Statutes define the legal frameworks and rules for credit reporting
                    compliance (e.g., Federal (PIPEDA) and provincial consumer protection acts).
                  </p>
                  <p style={{ marginTop: "0.5rem" }}>
                    They govern response timelines (clocks), packet requirements, and
                    specific obligations for creditors.
                  </p>
                </>
              }
              title="About Statutes"
            />
          </div>
        }
        subtitle="Create new statute versions and mark old versions as superseded. Statutes cannot be edited or deleted once created."
        
        role={authState.user.role}
      >
        <button
          className={styles.createButton}
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus size={18} />
          Create Statute
        </button>
      </PageHeader>

      <StatuteStats />

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filterLabel}>
            Filters
            <HelpTooltip
              content="Use these filters to narrow down statutes by jurisdiction (Federal/Provincial), specific code, or status. You can also toggle seeing historical superseded versions."
              side="right"
            />
          </div>
          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
            <Input
              type="text"
              placeholder="Search description or section..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            >
              <option value="">All Jurisdictions</option>
              {filterOptions?.jurisdictions.map(j => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            >
              <option value="">All Codes</option>
              {filterOptions?.codes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            <span className={styles.toggleLabel}>Active Only</span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={includeSuperseded}
              onChange={(e) => setIncludeSuperseded(e.target.checked)}
            />
            <span className={styles.toggleLabel}>Show Superseded</span>
          </label>
        </div>
      </div>

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
            <p>Failed to load statutes. Please try again.</p>
          </div>
        ) : Object.keys(groupedStatutes).length === 0 ? (
          <div className={styles.emptyState}>
            <p>No statutes found matching your filters.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => handleSort("jurisdiction")} className={styles.sortable}>
                    Jurisdiction / Code {getSortIcon("jurisdiction")}
                    <HelpTooltip
                      content="Jurisdictions include Federal (CA) and Provincial (e.g., ON, BC). Codes represent specific acts."
                      size={14}
                    />
                  </th>
                  <th onClick={() => handleSort("version")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Ver {getSortIcon("version")}
                  </th>
                  <th>Description</th>
                  <th onClick={() => handleSort("responseClockDays")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Clock {getSortIcon("responseClockDays")}
                    <HelpTooltip
                      content="The number of days legally allowed to respond to a dispute under this statute."
                      size={14}
                    />
                  </th>
                  <th onClick={() => handleSort("effectiveDate")} className={styles.sortable}>
                    Effective {getSortIcon("effectiveDate")}
                  </th>
                  <th onClick={() => handleSort("createdAt")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Created {getSortIcon("createdAt")}
                  </th>
                  <th onClick={() => handleSort("packetCount")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Packets {getSortIcon("packetCount")}
                  </th>
                  <th onClick={() => handleSort("obligationCount")} className={`${styles.sortable} ${styles.hideOnMobile}`}>
                    Obligations {getSortIcon("obligationCount")}
                    <HelpTooltip
                      content="Specific compliance tasks or checks required by this statute version."
                      size={14}
                    />
                  </th>
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
                      {statutes.map((statute) => (
                        <tr key={statute.versionId} className={styles.row}>
                          <td className={styles.indent}>
                            <div className={styles.citation}>
                              {statute.sectionReference}
                            </div>
                          </td>
                          <td className={styles.hideOnMobile}>v{statute.version}</td>
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
                            {statute.createdAt
                              ? format(new Date(statute.createdAt), "MMM d, yyyy")
                              : "-"}
                          </td>
                          <td className={styles.hideOnMobile}>
                            <Badge variant={statute.packetCount > 0 ? "primary" : "default"}>
                              {statute.packetCount}
                            </Badge>
                          </td>
                          <td className={styles.hideOnMobile}>
                            <Badge variant={statute.obligationCount > 0 ? "primary" : "default"}>
                              {statute.obligationCount}
                            </Badge>
                          </td>
                          <td>
                            {statute.supersededDate ? (
                              <Badge variant="default">Superseded</Badge>
                            ) : (
                              <Badge variant="success">Active</Badge>
                            )}
                          </td>
                          <td>
                            <div className={styles.actions}>
                              {!statute.supersededDate && (
                                <button
                                  className={styles.actionButton}
                                  onClick={() => handleMarkSuperseded(statute)}
                                  title="Mark as Superseded"
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
                                  title="View Source"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <StatuteFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}