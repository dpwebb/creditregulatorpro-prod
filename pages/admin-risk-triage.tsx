import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  RefreshCw,
  UserCog,
} from "lucide-react";

import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/Table";
import { useDismissViolation } from "../helpers/complianceViolationQueries";
import { formatDateTime } from "../helpers/formatters";
import { useHiddenRisks } from "../helpers/hiddenRiskQueries";
import { useToast } from "../helpers/useToast";
import type { HiddenRiskItem } from "../endpoints/hidden-risk/list_GET.schema";
import styles from "./admin-risk-triage.module.css";

function severityVariant(severity: string): "error" | "warning" | "info" {
  if (severity === "ERROR") return "error";
  if (severity === "WARNING") return "warning";
  return "info";
}

function buildCorrectionUrl(risk: HiddenRiskItem): string | null {
  if (!risk.extractionRunId) return null;

  const params = new URLSearchParams({
    tab: "violation-corrections",
    extractionRunId: String(risk.extractionRunId),
    tradelineId: String(risk.tradelineId),
    violationId: String(risk.id),
  });

  return `/admin-parser-testing?${params.toString()}`;
}

function searchRisk(risk: HiddenRiskItem, query: string): boolean {
  if (!query) return true;
  const haystack = [
    risk.id,
    risk.displayLabel,
    risk.violationCategory,
    risk.severity,
    risk.creditorName,
    risk.bureauName,
    risk.accountType,
    risk.accountNumberMasked,
    risk.affectedUser?.email,
    risk.affectedUser?.displayName,
    risk.affectedUser?.fullName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default function AdminRiskTriagePage() {
  const [search, setSearch] = useState("");
  const risksQuery = useHiddenRisks();
  const dismissViolation = useDismissViolation();
  const { showSuccess, showError } = useToast();

  const risks = risksQuery.data?.risks ?? [];
  const aggregate = risksQuery.data?.aggregate;
  const filteredRisks = useMemo(
    () => risks.filter((risk) => searchRisk(risk, search.trim())),
    [risks, search],
  );

  const handleMarkFalsePositive = async (risk: HiddenRiskItem) => {
    const confirmed = window.confirm(
      `Mark finding #${risk.id} as a false positive and remove it from the active risk queue?`,
    );
    if (!confirmed) return;

    try {
      await dismissViolation.mutateAsync({
        violationId: risk.id,
        status: "dismissed",
        reason: "Admin marked false positive from Compliance Risk Triage.",
      });
      showSuccess(`Finding #${risk.id} marked false positive`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to update finding");
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Compliance Risk Triage"
        subtitle="Admin queue for active hidden-risk findings detected from uploaded credit report tradelines."
      >
        <Button
          variant="outline"
          onClick={() => risksQuery.refetch()}
          disabled={risksQuery.isFetching}
        >
          <RefreshCw size={16} /> Refresh
        </Button>
      </PageHeader>

      <div className={styles.explainPanel}>
        <h2 className={styles.explainTitle}>What These Findings Represent</h2>
        <p className={styles.explainText}>
          These are compliance findings, not system/server errors. They mean the rule engine found
          a possible consumer-reporting risk on a tradeline. Admin should confirm whether the
          finding is valid, fix parser or rule evidence when the source data is wrong, or mark the
          finding false positive when it should not be consumer-facing.
        </p>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{aggregate?.totalCount ?? 0}</div>
          <div className={styles.summaryLabel}>Unresolved Risk Findings</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{aggregate?.uniqueUserCount ?? 0}</div>
          <div className={styles.summaryLabel}>Affected Users</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryValue} ${styles.highRiskValue}`}>
            {aggregate?.errorCount ?? 0}
          </div>
          <div className={styles.summaryLabel}>High-Risk Findings</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryValue} ${styles.reviewValue}`}>
            {aggregate?.warningCount ?? 0}
          </div>
          <div className={styles.summaryLabel}>Needs Review</div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2 className={styles.panelTitle}>Risk Queue</h2>
            <p className={styles.panelSubtitle}>
              Open the exact account, preview consumer wording, or send parser/rule defects to the correction tool.
            </p>
          </div>
          <Badge variant="default">
            {filteredRisks.length} shown
          </Badge>
        </div>

        <div className={styles.toolbar}>
          <Input
            className={styles.searchInput}
            value={search}
            placeholder="Search finding ID, user, creditor, bureau, account, or category"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {risksQuery.isError ? (
          <div className={styles.errorState}>Failed to load compliance risk findings.</div>
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finding</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className={styles.hideMobile}>Evidence</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risksQuery.isLoading || risksQuery.isFetching ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton style={{ height: "42px", margin: "var(--spacing-2) 0" }} />
                      <Skeleton style={{ height: "42px", margin: "var(--spacing-2) 0" }} />
                    </TableCell>
                  </TableRow>
                ) : filteredRisks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className={styles.emptyState}>
                      No active risk findings matched.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRisks.map((risk) => {
                    const correctionUrl = buildCorrectionUrl(risk);
                    return (
                      <TableRow key={risk.id}>
                        <TableCell>
                          <div className={styles.cellStack}>
                            <span className={styles.primaryText}>Finding #{risk.id}</span>
                            <span>{risk.displayLabel}</span>
                            <Badge variant={severityVariant(risk.severity)}>
                              {risk.severity === "ERROR" ? "High Risk" : risk.severity}
                            </Badge>
                            <span className={styles.monoText}>{risk.violationCategory}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={styles.cellStack}>
                            <span className={styles.primaryText}>
                              {risk.affectedUser?.fullName ||
                                risk.affectedUser?.displayName ||
                                risk.affectedUser?.email ||
                                `User #${risk.affectedUser?.id ?? "-"}`}
                            </span>
                            {risk.affectedUser?.email && (
                              <span className={styles.mutedText}>{risk.affectedUser.email}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={styles.cellStack}>
                            <span className={styles.primaryText}>
                              {risk.creditorName || "Unknown account"}
                            </span>
                            <span className={styles.mutedText}>
                              {[risk.bureauName, risk.accountType, risk.accountNumberMasked]
                                .filter(Boolean)
                                .join(" | ") || "No account detail"}
                            </span>
                            <span className={styles.monoText}>Tradeline #{risk.tradelineId}</span>
                          </div>
                        </TableCell>
                        <TableCell className={styles.hideMobile}>
                          <div className={styles.cellStack}>
                            <span>{risk.hasPacket ? "Packet exists" : "No packet yet"}</span>
                            <span className={styles.mutedText}>
                              {risk.detectedAt ? formatDateTime(risk.detectedAt) : "No detected date"}
                            </span>
                            <span className={styles.monoText}>
                              {risk.extractionRunId
                                ? `Run #${risk.extractionRunId}`
                                : risk.reportArtifactId
                                  ? `Artifact #${risk.reportArtifactId}`
                                  : "No source run"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={styles.actions}>
                            {risk.affectedUser?.id && (
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/admin-user-management/${risk.affectedUser.id}`}>
                                  <UserCog size={14} /> User
                                </Link>
                              </Button>
                            )}
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/tradelines/${risk.tradelineId}`}>
                                <ExternalLink size={14} /> Account
                              </Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/admin-ai-assist?findingId=${risk.id}`}>
                                <Bot size={14} /> AI Preview
                              </Link>
                            </Button>
                            {correctionUrl ? (
                              <Button asChild size="sm" variant="outline">
                                <Link to={correctionUrl}>
                                  <FileSearch size={14} /> Fix Source
                                </Link>
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" disabled>
                                <FileSearch size={14} /> No Source Run
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMarkFalsePositive(risk)}
                              disabled={dismissViolation.isPending}
                            >
                              <CheckCircle2 size={14} /> False Positive
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </div>
    </div>
  );
}
