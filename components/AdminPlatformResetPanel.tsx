import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, HardDrive, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import {
  PLATFORM_RESET_CONFIRMATION_PHRASE,
  postAdminPlatformResetDryRun,
  type PlatformResetCountRow,
  type PlatformResetMode,
  type PlatformResetResult,
} from "../endpoints/admin/platform-reset/dry-run_POST.schema";
import { postAdminPlatformResetConfirm } from "../endpoints/admin/platform-reset/confirm_POST.schema";
import styles from "./AdminPlatformResetPanel.module.css";

const DISPLAY_ROW_LIMIT = 80;

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function visibleRows(rows: PlatformResetCountRow[]) {
  return rows
    .filter((row) => !row.skipped || Number(row.count ?? 0) > 0)
    .slice(0, DISPLAY_ROW_LIMIT);
}

function RowCountTable({ rows }: { rows: PlatformResetCountRow[] }) {
  const displayRows = visibleRows(rows);
  if (displayRows.length === 0) {
    return <div className={styles.emptyState}>No matching rows.</div>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.countTable}>
        <thead>
          <tr>
            <th>Table</th>
            <th>Action</th>
            <th>Records</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <tr key={`${row.table ?? "update"}-${row.column ?? row.action ?? "row"}`}>
              <td>
                <span className={styles.mono}>{row.table ?? row.column}</span>
                {row.column ? <span className={styles.columnName}>.{row.column}</span> : null}
              </td>
              <td>{row.skipped ? row.reason : row.action ?? "delete_all"}</td>
              <td>{Number(row.count ?? 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > DISPLAY_ROW_LIMIT ? (
        <div className={styles.tableNote}>{rows.length - DISPLAY_ROW_LIMIT} additional rows hidden.</div>
      ) : null}
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon}>{icon}</div>
      <div>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statValue}>{value}</div>
      </div>
    </div>
  );
}

function ValidationSummary({ result }: { result: PlatformResetResult }) {
  if (result.validation.length === 0) return null;
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Post-reset validation</h3>
      <div className={styles.validationGrid}>
        {result.validation.map((check) => (
          <div className={styles.validationRow} data-status={check.status} key={check.name}>
            <span className={styles.validationName}>{check.name}</span>
            <span className={styles.validationStatus}>{check.status}</span>
            {check.detail ? <span className={styles.validationDetail}>{check.detail}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ScopeList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.scopeList}>
        {items.map((item) => (
          <span className={styles.scopeItem} key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

export function AdminPlatformResetPanel() {
  const [mode, setMode] = useState<PlatformResetMode>("hard");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<PlatformResetResult | null>(null);
  const [result, setResult] = useState<PlatformResetResult | null>(null);
  const queryClient = useQueryClient();

  const dryRunMutation = useMutation({
    mutationFn: () => postAdminPlatformResetDryRun({ mode }),
    onSuccess: (data) => {
      setPreview(data.result);
      setResult(null);
      setConfirmation("");
      toast.success("Platform reset dry-run ready", {
        description: `${countLabel(data.result.totalRowsMatched, "matching row")} found.`,
      });
    },
    onError: (error) => {
      setPreview(null);
      toast.error("Platform reset dry-run failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Run dry-run before confirming reset.");
      return postAdminPlatformResetConfirm({
        mode,
        confirmation,
        expectedDatabase: preview.database,
      });
    },
    onSuccess: (data) => {
      setResult(data.result);
      setPreview(data.result);
      setConfirmation("");
      toast.success("Platform reset completed", {
        description: `${countLabel(data.result.totalRowsMatched, "row")} cleared.`,
      });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["audit", "logs"] });
    },
    onError: (error) => {
      toast.error("Platform reset failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const activeResult = result ?? preview;
  const isProduction = activeResult?.environment.kind === "production";
  const confirmationMatches = confirmation === PLATFORM_RESET_CONFIRMATION_PHRASE;
  const confirmDisabled =
    !preview ||
    isProduction ||
    !confirmationMatches ||
    confirmMutation.isPending ||
    dryRunMutation.isPending;

  const deletedTables = useMemo(
    () => (activeResult ? activeResult.rowsByTable.filter((row) => Number(row.count ?? 0) > 0).map((row) => row.table).filter(Boolean) as string[] : []),
    [activeResult],
  );

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h2 className={styles.title}>Admin Platform Reset</h2>
          <p className={styles.description}>
            Reset staging or development operational data while preserving platform intelligence and admin access.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => dryRunMutation.mutate()}
          disabled={dryRunMutation.isPending || confirmMutation.isPending}
          className={styles.primaryAction}
        >
          <RotateCcw size={16} />
          {dryRunMutation.isPending ? "Previewing..." : "Reset Platform Test Data"}
        </Button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Reset mode</h3>
        <div className={styles.modeGrid}>
          <label className={styles.modeOption}>
            <input
              type="radio"
              name="platform-reset-mode"
              checked={mode === "hard"}
              onChange={() => setMode("hard")}
              disabled={dryRunMutation.isPending || confirmMutation.isPending}
            />
            <span>
              <strong>Hard</strong>
              <small>Clear operational data and non-admin users.</small>
            </span>
          </label>
          <label className={styles.modeOption}>
            <input
              type="radio"
              name="platform-reset-mode"
              checked={mode === "soft"}
              onChange={() => setMode("soft")}
              disabled={dryRunMutation.isPending || confirmMutation.isPending}
            />
            <span>
              <strong>Soft</strong>
              <small>Clear operational data and preserve users.</small>
            </span>
          </label>
        </div>
      </section>

      {activeResult ? (
        <>
          <section className={styles.summaryGrid}>
            <SummaryStat
              icon={<Database size={18} />}
              label="Environment"
              value={`${activeResult.environment.kind} / ${activeResult.database.database}`}
            />
            <SummaryStat
              icon={<Users size={18} />}
              label="Users"
              value={`${activeResult.userPlan.deletedCount.toLocaleString()} delete / ${activeResult.userPlan.preservedCount.toLocaleString()} preserve`}
            />
            <SummaryStat
              icon={<HardDrive size={18} />}
              label="Storage"
              value={`${activeResult.storage?.references.totalReferences ?? 0} refs / ${activeResult.storage?.references.notFoundReferences.length ?? 0} missing`}
            />
            <SummaryStat
              icon={<ShieldCheck size={18} />}
              label="Records"
              value={`${activeResult.totalRowsMatched.toLocaleString()} rows`}
            />
          </section>

          <section className={styles.environmentBox}>
            <div>
              <span className={styles.metaLabel}>Database host</span>
              <span className={styles.metaValue}>{activeResult.database.host}:{activeResult.database.port}</span>
            </div>
            <div>
              <span className={styles.metaLabel}>Database source</span>
              <span className={styles.metaValue}>{activeResult.database.source}</span>
            </div>
            <div>
              <span className={styles.metaLabel}>Storage provider</span>
              <span className={styles.metaValue}>{activeResult.storage?.provider.provider ?? "unknown"}</span>
            </div>
          </section>

          {isProduction ? (
            <div className={styles.dangerNotice}>
              <AlertTriangle size={18} />
              Production reset is disabled.
            </div>
          ) : null}

          <ScopeList title="Preserved" items={activeResult.preservedSubsystems} />

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Affected tables</h3>
            <RowCountTable rows={activeResult.rowsByTable} />
          </section>

          <ScopeList title="Tables with matching reset data" items={deletedTables.length > 0 ? deletedTables : ["No tables currently have matching rows."]} />

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Storage cleanup</h3>
            <div className={styles.storageGrid}>
              <span>Referenced generated objects: {(activeResult.storage?.references.totalReferences ?? 0).toLocaleString()}</span>
              <span>Existing local objects: {(activeResult.storage?.references.localReadable ?? 0).toLocaleString()}</span>
              <span>storage_read_failed:not_found: {(activeResult.storage?.references.notFoundReferences.length ?? 0).toLocaleString()}</span>
              <span>Unsupported references: {(activeResult.storage?.references.unsupportedReferences.length ?? 0).toLocaleString()}</span>
            </div>
          </section>

          {!result ? (
            <section className={styles.confirmBox}>
              <label className={styles.confirmLabel} htmlFor="platform-reset-confirmation">
                Type {PLATFORM_RESET_CONFIRMATION_PHRASE} to enable confirmed reset.
              </label>
              <input
                id="platform-reset-confirmation"
                className={styles.confirmInput}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={confirmMutation.isPending}
              />
              <Button
                variant="destructive"
                onClick={() => confirmMutation.mutate()}
                disabled={confirmDisabled}
                className={styles.confirmButton}
              >
                <AlertTriangle size={16} />
                {confirmMutation.isPending ? "Resetting..." : "Confirm Reset"}
              </Button>
            </section>
          ) : null}

          <ValidationSummary result={activeResult} />
        </>
      ) : (
        <div className={styles.placeholder}>
          Run the dry-run preview to load environment, database, user, table, and storage counts.
        </div>
      )}
    </div>
  );
}
