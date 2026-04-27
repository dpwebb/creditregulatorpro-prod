import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Package, FileText } from "lucide-react";
import { formatRelativeTime, formatDate } from "../helpers/formatters";
import { Skeleton } from "./Skeleton";
import { Badge } from "./Badge";
import { DashboardEmptyState } from "./DashboardEmptyState";
import { PacketWithDetails } from "../endpoints/dashboard/stats_GET.schema";
import styles from "./DashboardActivityTable.module.css";

interface DashboardActivityTableProps {
  packets?: PacketWithDetails[];
  isLoading: boolean;
  isAdmin?: boolean;
}

const getTradelineIdentifier = (packet: PacketWithDetails): string => {
  if (packet.creditorName) return ` for ${packet.creditorName}`;
  if (packet.originalCreditorName) return ` for ${packet.originalCreditorName}`;
  if (packet.tradelineAccountNumber) return ` for account #${packet.tradelineAccountNumber}`;
  return '';
};

const getActivityText = (packet: PacketWithDetails) => {
  const accountText = getTradelineIdentifier(packet);
  const statusLower = packet.status?.toLowerCase() || "";
  
  if (statusLower.includes("sent") || packet.deliveryMethod) {
    let text = `Sent dispute letter${accountText}`;
    if (packet.deliveryMethod) {
      text += ` via ${packet.deliveryMethod}`;
    }
    return text;
  }
  
  if (statusLower === "draft") {
    return `Drafted dispute letter${accountText}`;
  }

  if (packet.terminalLabel) {
    return `Completed dispute${accountText}`;
  }
  
  return `Created dispute letter${accountText}`;
};

export const DashboardActivityTable = ({ 
  packets, 
  isLoading,
  isAdmin = false
}: DashboardActivityTableProps) => {
  const navigate = useNavigate();

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <Activity className={styles.sectionIcon} />
          <h2 className={styles.sectionTitle}>What Happened Recently</h2>
        </div>
        <Link to="/packets" className={styles.viewAllLink}>
          See All
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {isAdmin ? (
                <>
                  <th>User</th>
                  <th>Activity</th>
                  <th>When</th>
                </>
              ) : (
                <>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Final Status</th>
                  <th>Created</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {isAdmin ? (
                    <>
                      <td><Skeleton className={styles.skeletonCell} /></td>
                      <td><Skeleton className={styles.skeletonCell} style={{ width: "200px" }} /></td>
                      <td><Skeleton className={styles.skeletonCell} style={{ width: "80px" }} /></td>
                    </>
                  ) : (
                    <>
                      <td><Skeleton className={styles.skeletonCell} /></td>
                      <td><Skeleton className={styles.skeletonCell} style={{ width: "60px" }} /></td>
                      <td><Skeleton className={styles.skeletonCell} style={{ width: "100px" }} /></td>
                      <td><Skeleton className={styles.skeletonCell} style={{ width: "80px" }} /></td>
                    </>
                  )}
                </tr>
              ))
            ) : packets && packets.length > 0 ? (
              packets.map((packet) => (
                <tr 
                  key={packet.id} 
                  className={styles.clickableRow}
                  onClick={() => {
                    if (packet.tradelineId) {
                      navigate(`/tradelines/${packet.tradelineId}`);
                    } else {
                      navigate("/packets");
                    }
                  }}
                >
                  {isAdmin ? (
                    <>
                      <td>
                        <div className={styles.userCell}>
                          <span className={styles.userName}>
                            {packet.userFullName || packet.userName || packet.userEmail || "Unknown"}
                          </span>
                          {packet.userEmail && (
                            <span className={styles.userEmail}>{packet.userEmail}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={styles.activityText} title={getActivityText(packet)}>
                          {getActivityText(packet)}
                        </span>
                      </td>
                      <td className={styles.dateCell} title={formatDate(packet.createdAt)}>
                        {formatRelativeTime(packet.createdAt)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className={styles.accountCell}>
                          <FileText size={14} className={styles.accountIcon} />
                          <span className={styles.accountNumber}>
                            {packet.tradelineAccountNumber || "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge 
                          variant="default" 
                          className={styles.statusBadge}
                        >
                          {packet.status || "Pending"}
                        </Badge>
                      </td>
                      <td>
                        {packet.terminalLabel ? (
                          <span className={styles.label}>{packet.terminalLabel}</span>
                        ) : (
                          <span className={styles.emptyValue}>—</span>
                        )}
                      </td>
                      <td className={styles.dateCell} title={formatDate(packet.createdAt)}>
                        {formatRelativeTime(packet.createdAt)}
                      </td>
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isAdmin ? 3 : 4} className={styles.emptyCell}>
                  <DashboardEmptyState
                    icon={Package}
                    title="Nothing yet"
                    description="You haven't written any dispute letters yet. Write one to get started."
                    action={{
                      label: "Write a Letter",
                      onClick: () => navigate("/packets")
                    }}
                    helpContent="Dispute letters are what you send to fix mistakes on your credit report."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};