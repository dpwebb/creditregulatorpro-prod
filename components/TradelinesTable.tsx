import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Skeleton } from "./Skeleton";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { HelpTooltip } from "./HelpTooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";
import {
  CreditCard,
  Calendar,
  FileText,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  AlertTriangle,
  Send,
  MessageSquare,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { TradelineWithDetails } from "../endpoints/tradeline/list_GET.schema";
import { formatCurrency, formatDate } from "../helpers/formatters";
import { BureauBadge } from "./BureauBadge";
import styles from "./TradelinesTable.module.css";

export type Tradeline = TradelineWithDetails & {
  remarks?: string[]; // Adding optional remarks for UI display
};

interface TradelinesTableProps {
  data: Tradeline[];
  isLoading: boolean;
  groupByBureau?: boolean;
  bureauFilter?: string;
}

type SortConfig = {
  key: keyof Tradeline;
  direction: "asc" | "desc";
};

interface SortableHeaderProps {
  label: string;
  field: keyof Tradeline;
  align?: "left" | "right";
  sortConfig: SortConfig | null;
  onSort: (key: keyof Tradeline) => void;
  className?: string;
}

const SortableHeader = ({
  label,
  field,
  align = "left",
  sortConfig,
  onSort,
  className,
}: SortableHeaderProps) => {
  const renderSortIcon = () => {
    if (sortConfig?.key !== field) return null;
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={12} className={styles.sortIcon} />
    ) : (
      <ArrowDown size={12} className={styles.sortIcon} />
    );
  };

  return (
    <TableHead
      onClick={() => onSort(field)}
      className={`${styles.sortableHead} ${className || ""}`}
      style={{ textAlign: align }}
    >
      <div
        className={`${styles.headerContent} ${
          align === "right" ? styles.headerRight : ""
        }`}
      >
        {label}
        {renderSortIcon()}
      </div>
    </TableHead>
  );
};

export const getDisputeStatusLabel = (status: string | null): string => {
  switch (status) {
    case "OBLIGATION_PENDING": return "Problems Found";
    case "CHALLENGED": return "Letter Sent";
    case "NO_RESPONSE": return "No Answer Yet";
    case "INSUFFICIENT_RESPONSE": return "Bad Answer";
    case "PROCEDURALLY_EXHAUSTED": return "All Steps Done ✓";
    case "VIOLATION_PENDING": return "Problems Found";
    default: return "No Problems";
  }
};

export const TradelinesTable = ({
  data,
  isLoading,
  groupByBureau = false,
}: TradelinesTableProps) => {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const navigate = useNavigate();

  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = desktopContainerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isWideContainer = containerWidth >= 1100;

  // Sorting Logic
  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (sortConfig.key === "balance" || sortConfig.key === "currentBalance") {
        const aVal = Number(a.currentBalance ?? a.balance ?? 0);
        const bVal = Number(b.currentBalance ?? b.balance ?? 0);
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      } else {
        const aString = String(aValue).toLowerCase();
        const bString = String(bValue).toLowerCase();
        if (aString < bString) return sortConfig.direction === "asc" ? -1 : 1;
        if (aString > bString) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      }
    });
  }, [data, sortConfig]);

  const groups = useMemo(() => {
    if (!groupByBureau) {
      return [{ key: "all", label: "All Accounts", data: sortedData }];
    }

    const equifax: Tradeline[] = [];
    const transunion: Tradeline[] = [];
    const other: Tradeline[] = [];

    sortedData.forEach((t) => {
      const name = (t.bureauName || "").toLowerCase();
      if (name.includes("equifax")) equifax.push(t);
      else if (name.includes("transunion") || name.includes("trans union"))
        transunion.push(t);
      else other.push(t);
    });

    const result = [];
    if (equifax.length > 0) result.push({ key: "equifax", label: "Equifax", data: equifax });
    if (transunion.length > 0) result.push({ key: "transunion", label: "TransUnion", data: transunion });
    if (other.length > 0) result.push({ key: "other", label: "Other", data: other });

    return result.length > 0 ? result : [{ key: "all", label: "All Accounts", data: [] }];
  }, [sortedData, groupByBureau]);

  const handleSort = (key: keyof Tradeline) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        if (current.direction === "asc") return { key, direction: "desc" };
        return null; // Reset
      }
      return { key, direction: "asc" };
    });
  };

  const getDisputeStatusClassName = (status: string | null) => {
    switch (status) {
      case "OBLIGATION_PENDING": return styles.statusViolationPending;
      case "CHALLENGED": return styles.statusChallenged;
      case "NO_RESPONSE": return styles.statusNoResponse;
      case "INSUFFICIENT_RESPONSE": return styles.statusInsufficient;
      case "PROCEDURALLY_EXHAUSTED": return styles.statusExhausted;
      case "VIOLATION_PENDING": return styles.statusViolationPending;
      default: return styles.statusNotDisputed;
    }
  };

  return (
    <>
      {/* Desktop Table View */}
      <TableContainer
        ref={desktopContainerRef}
        className={`${styles.container} ${styles.desktopOnly}`}
      >
        <Table className={styles.customTable}>
          <TableHeader>
            <TableRow>
              <SortableHeader
                label="Creditor"
                field="creditorName"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              {isWideContainer && (
                <TableHead
                  onClick={() => handleSort("accountType")}
                  className={styles.sortableHead}
                >
                  <div className={styles.headerContent}>
                    Credit Type
                    <HelpTooltip
                      content={
                        <div className={styles.typeTooltipContent}>
                          <p>
                            <strong>Charge:</strong> Accounts you pay in full each month
                          </p>
                          <p>
                            <strong>Revolving:</strong> Credit cards and lines of credit
                          </p>
                          <p>
                            <strong>Installment:</strong> Loans with fixed payments
                          </p>
                        </div>
                      }
                      size={14}
                      side="top"
                    />
                    {sortConfig?.key === "accountType" &&
                      (sortConfig.direction === "asc" ? (
                        <ArrowUp size={12} className={styles.sortIcon} />
                      ) : (
                        <ArrowDown size={12} className={styles.sortIcon} />
                      ))}
                  </div>
                </TableHead>
              )}
              <SortableHeader
                label="Dispute Progress"
                field="disputeStatus"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortableHeader
                label="Balance"
                field="balance"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortableHeader
                label="Credit Reporting Company"
                field="bureauName"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              {isWideContainer && (
                <SortableHeader
                  label="Opened"
                  field="openedDate"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  {isWideContainer && (
                    <TableCell>
                      <Skeleton className={styles.skeletonCell} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  {isWideContainer && (
                    <TableCell>
                      <Skeleton className={styles.skeletonCell} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : sortedData.length > 0 ? (
              groups.map((group) => (
                <React.Fragment key={group.key}>
                  {groupByBureau && group.data.length > 0 && (
                    <TableRow className={styles.groupHeaderRow}>
                      <TableCell colSpan={isWideContainer ? 6 : 4} className={styles.groupHeaderCell}>
                        <div className={styles.groupHeaderContent}>
                          <BureauBadge bureauName={group.label} size="sm" />
                          <span className={styles.groupCount}>{group.data.length} Account{group.data.length === 1 ? '' : 's'}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {group.data.map((tradeline) => (
                    <TableRow 
                      key={tradeline.id} 
                      className={`${styles.row} ${styles.clickableRow}`}
                      onClick={() => navigate(`/tradelines/${tradeline.id}?tab=compliance`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          navigate(`/tradelines/${tradeline.id}?tab=compliance`);
                        }
                      }}
                    >
                      <TableCell>
                        <div className={styles.accountCell}>
                          <div className={styles.iconWrapper}>
                            <CreditCard size={16} />
                          </div>
                          <div className={styles.accountInfo}>
                            <div
                              className={styles.creditorLink}
                              title={tradeline.creditorName || "Unknown Creditor"}
                            >
                              <span className={styles.creditorName}>
                                {tradeline.creditorName || "Unknown Creditor"}
                              </span>
                              <ChevronRight size={14} className={styles.creditorIcon} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {isWideContainer && (
                        <TableCell>
                          <span className={styles.typeText}>
                            {(() => {
                              if (!tradeline.accountType) return "—";
                              const type = tradeline.accountType.toLowerCase();
                              if (type === "open") return "Charge";
                              return type.charAt(0).toUpperCase() + type.slice(1);
                            })()}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className={styles.statusCell}>
                          <Badge
                            variant="default"
                            className={`${styles.statusBadge} ${getDisputeStatusClassName(tradeline.disputeStatus)}`}
                          >
                            {getDisputeStatusLabel(tradeline.disputeStatus)}
                          </Badge>
                          
                          {tradeline.violationCount === 0 ? (
                            <div className={styles.noProblemsText}>No problems found ✓</div>
                          ) : (
                                                        <div className={styles.progressStats}>
                              {tradeline.violationCount} problem{tradeline.violationCount !== 1 ? 's' : ''} &middot; {tradeline.packetsCreatedCount} created &middot; {tradeline.challengesSentCount} sent &middot; {tradeline.responsesReceivedCount} repl{tradeline.responsesReceivedCount !== 1 ? 'ies' : 'y'}
                            </div>
                          )}

                          {tradeline.nextDeadline && (
                            <div className={styles.deadlineLine}>
                              ⏰ Deadline: {formatDate(tradeline.nextDeadline)}
                            </div>
                          )}

                          {tradeline.approachingStatuteMonths != null && (
                            <div className={styles.removalLine}>
                              ⏳ Removal in {tradeline.approachingStatuteMonths} month{tradeline.approachingStatuteMonths !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={styles.balanceText}>
                          {tradeline.currentBalance !== null || tradeline.balance !== null
                            ? formatCurrency(Number(tradeline.currentBalance ?? tradeline.balance))
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={styles.bureauCell}>
                          <BureauBadge bureauName={tradeline.bureauName} size="sm" />
                          {tradeline.crossBureauTradelineId && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link to="/my-accounts?tab=compare" className={styles.bothBureausBadge} onClick={(e) => e.stopPropagation()}>Both Bureaus</Link>
                              </TooltipTrigger>
                              <TooltipContent>This account is on both Equifax and TransUnion</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      {isWideContainer && (
                        <TableCell>
                          <div className={styles.dateCell}>
                            <Calendar size={14} className={styles.cellIcon} />
                            {tradeline.openedDate ? formatDate(tradeline.openedDate) : "—"}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={isWideContainer ? 6 : 4}>
                  <div className={styles.emptyState}>
                    <FileText size={40} />
                    <h3>
                      No Accounts Found
                      <HelpTooltip
                        content="These are the accounts on your credit report."
                        size={16}
                        side="right"
                        className={styles.emptyStateTooltip}
                      />
                    </h3>
                    <p>Upload your credit report to see your accounts here.</p>
                    <Button variant="default" size="sm" asChild>
                      <Link to="/upload">Upload Your Report</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Mobile Card View */}
      <div className={`${styles.mobileOnly} ${styles.mobileListContainer}`}>
        {isLoading ? (
          <div className={styles.mobileCardList}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className={styles.skeletonMobileCard} />
            ))}
          </div>
        ) : sortedData.length > 0 ? (
          <div className={styles.mobileCardList}>
            {groups.map((group) => (
              <React.Fragment key={group.key}>
                {groupByBureau && group.data.length > 0 && (
                  <div className={styles.mobileGroupHeader}>
                    <BureauBadge bureauName={group.label} size="sm" />
                    <span className={styles.groupCount}>{group.data.length} Account{group.data.length === 1 ? '' : 's'}</span>
                  </div>
                )}
                {group.data.map((tradeline) => (
                  <div
                    key={tradeline.id}
                    onClick={() => navigate(`/tradelines/${tradeline.id}?tab=compliance`)}
                    className={styles.mobileCard}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigate(`/tradelines/${tradeline.id}?tab=compliance`);
                      }
                    }}
                  >
                    <div className={styles.mobileCardTop}>
                      <div className={styles.mobileCardTitleRow}>
                        <div
                          className={styles.creditorLink}
                          title={tradeline.creditorName || "Unknown Creditor"}
                        >
                          <span className={styles.creditorName}>
                            {tradeline.creditorName || "Unknown Creditor"}
                          </span>
                          <ChevronRight size={14} className={styles.creditorIcon} />
                        </div>
                      </div>
                    </div>

                    <div className={styles.mobileCardMiddle}>
                      <div className={styles.mobileCardDetail}>
                        <span className={styles.mobileCardLabel}>Dispute Progress</span>
                        <Badge
                          variant="default"
                          className={`${styles.statusBadge} ${getDisputeStatusClassName(tradeline.disputeStatus)}`}
                        >
                          {getDisputeStatusLabel(tradeline.disputeStatus)}
                        </Badge>
                        
                        {tradeline.violationCount === 0 ? (
                          <div className={styles.noProblemsText}>No problems found ✓</div>
                        ) : (
                                                                              <div className={styles.mobileStatsRow}>
                            <div className={styles.mobileStatItem}>
                              <span className={styles.mobileStatLabel}>Problems</span> {tradeline.violationCount}
                            </div>
                            <div className={styles.mobileStatItem}>
                              <span className={styles.mobileStatLabel}>Created</span> {tradeline.packetsCreatedCount}
                            </div>
                            <div className={styles.mobileStatItem}>
                              <span className={styles.mobileStatLabel}>Sent</span> {tradeline.challengesSentCount}
                            </div>
                            <div className={styles.mobileStatItem}>
                              <span className={styles.mobileStatLabel}>Replies</span> {tradeline.responsesReceivedCount}
                            </div>
                          </div>
                        )}

                        {tradeline.nextDeadline && (
                          <div className={styles.deadlineLine}>
                            ⏰ Deadline: {formatDate(tradeline.nextDeadline)}
                          </div>
                        )}

                        {tradeline.approachingStatuteMonths != null && (
                          <div className={styles.removalLine}>
                            ⏳ Removal in {tradeline.approachingStatuteMonths} month{tradeline.approachingStatuteMonths !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      <div className={styles.mobileCardDetail}>
                        <span className={styles.mobileCardLabel}>Balance</span>
                        <span className={styles.balanceText}>
                          {tradeline.currentBalance !== null || tradeline.balance !== null
                            ? formatCurrency(Number(tradeline.currentBalance ?? tradeline.balance))
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.mobileCardBottom}>
                      <div className={styles.bureauCell}>
                        <BureauBadge bureauName={tradeline.bureauName} size="sm" />
                        {tradeline.crossBureauTradelineId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to="/my-accounts?tab=compare"
                                className={styles.bothBureausBadge}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Both Bureaus
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>This account is on both Equifax and TransUnion</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <FileText size={40} />
            <h3>No Accounts Found</h3>
            <p>Upload your credit report to see your accounts here.</p>
            <Button variant="default" size="sm" asChild>
              <Link to="/upload">Upload Your Report</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
};