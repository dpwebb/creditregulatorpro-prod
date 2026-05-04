import { FormEvent, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Play, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Checkbox } from "../components/Checkbox";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import {
  useAdminMockLifecycleList,
  useAdminMockLifecycleReport,
  useAdminMockLifecycleStatus,
  useRunAdminMockLifecycle,
} from "../helpers/adminMockLifecycleQueries";
import type { MockLifecycleJobRecord } from "../endpoints/admin/mock-lifecycle/types";
import styles from "./admin-mock-lifecycle.module.css";

function statusVariant(status: MockLifecycleJobRecord["status"]): "info" | "warning" | "success" | "error" {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "error";
  if (status === "RUNNING") return "warning";
  return "info";
}

export default function AdminMockLifecyclePage() {
  const [initialReportPath, setInitialReportPath] = useState(".local/fixtures/mock-initial-report.pdf");
  const [followupReportPath, setFollowupReportPath] = useState(".local/fixtures/mock-followup-report.pdf");
  const [simulateDays, setSimulateDays] = useState("30");
  const [packetCount, setPacketCount] = useState("2");
  const [strict, setStrict] = useState(false);
  const [useDbAssist, setUseDbAssist] = useState(true);
  const [baseUrl, setBaseUrl] = useState("http://localhost:3333");
  const [origin, setOrigin] = useState("https://staging.creditregulatorpro.com");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const lifecycleList = useAdminMockLifecycleList(40);
  const runMutation = useRunAdminMockLifecycle();
  const statusQuery = useAdminMockLifecycleStatus(selectedJobId);

  const selectedJobFromList = useMemo(
    () => lifecycleList.data?.jobs.find((job) => job.jobId === selectedJobId) ?? null,
    [lifecycleList.data, selectedJobId]
  );
  const selectedJob = statusQuery.data?.job ?? selectedJobFromList;

  const reportQuery = useAdminMockLifecycleReport(
    selectedJobId,
    selectedJob?.status === "COMPLETED"
  );

  const running = runMutation.isPending || selectedJob?.status === "RUNNING" || selectedJob?.status === "QUEUED";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await runMutation.mutateAsync({
      initialReportPath,
      followupReportPath,
      simulateDays: Number(simulateDays),
      packetCount: Number(packetCount),
      strict,
      useDbAssist,
      baseUrl,
      origin,
    });
    setSelectedJobId(response.job.jobId);
  };

  const reportData = reportQuery.data?.report as
    | {
        coverageSummary?: {
          passed: number;
          failed: number;
          blocked: number;
          skipped: number;
          total: number;
        };
        coverageMatrix?: Array<{
          key: string;
          status: string;
          label: string;
          details: string;
        }>;
        stepLogs?: Array<{
          name: string;
          status: string;
          details: string;
          startedAt: string;
          completedAt: string;
        }>;
      }
    | undefined;

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Lifecycle Testing | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Mock User Lifecycle Testing"
        subtitle="Admin-only runner and reviewer for full user lifecycle dispute flow."
      />

      <div className={styles.notice}>
        Use project-local fixture paths only. OneDrive and My Drive paths are blocked.
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Start New Run</h2>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Initial report path (PDF)</span>
              <Input
                value={initialReportPath}
                onChange={(e) => setInitialReportPath(e.target.value)}
                placeholder=".local/fixtures/mock-initial-report.pdf"
              />
            </label>
            <label className={styles.field}>
              <span>Follow-up report path (PDF)</span>
              <Input
                value={followupReportPath}
                onChange={(e) => setFollowupReportPath(e.target.value)}
                placeholder=".local/fixtures/mock-followup-report.pdf"
              />
            </label>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Simulated day gap</span>
                <Input
                  value={simulateDays}
                  onChange={(e) => setSimulateDays(e.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label className={styles.field}>
                <span>Packet count</span>
                <Input
                  value={packetCount}
                  onChange={(e) => setPacketCount(e.target.value)}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>API base URL</span>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Origin header</span>
                <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </label>
            </div>
            <label className={styles.inlineCheck}>
              <Checkbox checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              <span>Strict mode (fail if any FAILED or BLOCKED coverage item)</span>
            </label>
            <label className={styles.inlineCheck}>
              <Checkbox checked={useDbAssist} onChange={(e) => setUseDbAssist(e.target.checked)} />
              <span>Use DB assist for token verification flows</span>
            </label>
            <div className={styles.actions}>
              <Button type="submit" disabled={runMutation.isPending}>
                <Play size={16} />
                {runMutation.isPending ? "Starting..." : "Start Lifecycle Run"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => lifecycleList.refetch()}
                disabled={lifecycleList.isFetching}
              >
                <RefreshCw size={16} />
                Refresh Jobs
              </Button>
            </div>
          </form>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent Runs</h2>
          <div className={styles.jobList}>
            {lifecycleList.data?.jobs.map((job) => (
              <button
                key={job.jobId}
                className={`${styles.jobItem} ${selectedJobId === job.jobId ? styles.jobItemActive : ""}`}
                onClick={() => setSelectedJobId(job.jobId)}
                type="button"
              >
                <div className={styles.jobItemTop}>
                  <code className={styles.jobId}>{job.jobId}</code>
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                </div>
                <div className={styles.jobMeta}>
                  <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
                  {job.coverageSummary && (
                    <span>
                      Pass {job.coverageSummary.passed} / Fail {job.coverageSummary.failed} / Blocked{" "}
                      {job.coverageSummary.blocked}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!lifecycleList.data?.jobs.length && (
              <div className={styles.empty}>No lifecycle runs found yet.</div>
            )}
          </div>
        </section>
      </div>

      {selectedJob && (
        <section className={styles.panel}>
          <div className={styles.selectedHeader}>
            <h2 className={styles.panelTitle}>Run Detail</h2>
            <Badge variant={statusVariant(selectedJob.status)}>{selectedJob.status}</Badge>
          </div>

          <div className={styles.metaGrid}>
            <div>
              <strong>Job ID:</strong> <code>{selectedJob.jobId}</code>
            </div>
            <div>
              <strong>Started:</strong>{" "}
              {selectedJob.startedAt ? new Date(selectedJob.startedAt).toLocaleString() : "-"}
            </div>
            <div>
              <strong>Completed:</strong>{" "}
              {selectedJob.completedAt ? new Date(selectedJob.completedAt).toLocaleString() : "-"}
            </div>
            <div>
              <strong>Run output:</strong> <code>{selectedJob.runOutputDir}</code>
            </div>
          </div>

          {selectedJob.error && <div className={styles.errorBox}>{selectedJob.error}</div>}

          {running && (
            <div className={styles.runningBox}>
              <Spinner size="sm" />
              <span>Lifecycle suite is running. Status refresh is automatic.</span>
            </div>
          )}

          {reportQuery.isFetching && (
            <div className={styles.runningBox}>
              <Spinner size="sm" />
              <span>Loading report...</span>
            </div>
          )}

          {reportData?.coverageSummary && (
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span>Total</span>
                <strong>{reportData.coverageSummary.total}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Passed</span>
                <strong>{reportData.coverageSummary.passed}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Failed</span>
                <strong>{reportData.coverageSummary.failed}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Blocked</span>
                <strong>{reportData.coverageSummary.blocked}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Skipped</span>
                <strong>{reportData.coverageSummary.skipped}</strong>
              </div>
            </div>
          )}

          {reportData?.coverageMatrix && (
            <div className={styles.tableWrap}>
              <h3>Coverage Matrix</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Status</th>
                    <th>Label</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.coverageMatrix.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <code>{item.key}</code>
                      </td>
                      <td>{item.status}</td>
                      <td>{item.label}</td>
                      <td>{item.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedJob.logs.length > 0 && (
            <div className={styles.logsWrap}>
              <h3>Runner Log</h3>
              <pre className={styles.logs}>{selectedJob.logs.join("\n")}</pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

