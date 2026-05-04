import { FormEvent, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
  const [initialReportPath, setInitialReportPath] = useState("");
  const [followupReportPath, setFollowupReportPath] = useState("");
  const [initialReportUpload, setInitialReportUpload] = useState<{
    fileName: string;
    mimeType: string;
    bytesBase64: string;
  } | null>(null);
  const [followupReportUpload, setFollowupReportUpload] = useState<{
    fileName: string;
    mimeType: string;
    bytesBase64: string;
  } | null>(null);
  const [simulateDays, setSimulateDays] = useState("30");
  const [packetCount, setPacketCount] = useState("2");
  const [strict, setStrict] = useState(false);
  const [useDbAssist, setUseDbAssist] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [origin, setOrigin] = useState("");
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

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  };

  const handleUploadChange = async (
    file: File | null,
    target: "initial" | "followup"
  ) => {
    if (!file) {
      if (target === "initial") setInitialReportUpload(null);
      if (target === "followup") setFollowupReportUpload(null);
      return;
    }

    const bytesBase64 = await toBase64(file);
    const payload = {
      fileName: file.name,
      mimeType: file.type || "application/pdf",
      bytesBase64,
    };

    if (target === "initial") setInitialReportUpload(payload);
    if (target === "followup") setFollowupReportUpload(payload);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const initialPath = initialReportPath.trim();
    const followupPath = followupReportPath.trim();
    const baseUrlValue = baseUrl.trim();
    const originValue = origin.trim();

    if (!initialPath && !initialReportUpload) {
      toast.error("Provide an initial report path or upload an initial PDF.");
      return;
    }

    const response = await runMutation.mutateAsync({
      ...(initialPath ? { initialReportPath: initialPath } : {}),
      ...(followupPath ? { followupReportPath: followupPath } : {}),
      ...(initialReportUpload ? { initialReportUpload } : {}),
      ...(followupReportUpload ? { followupReportUpload } : {}),
      simulateDays: Number(simulateDays),
      packetCount: Number(packetCount),
      strict,
      useDbAssist,
      ...(baseUrlValue ? { baseUrl: baseUrlValue } : {}),
      ...(originValue ? { origin: originValue } : {}),
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
        Preferred: upload PDFs directly below. Path-based fixtures are optional and must exist on the API server filesystem.
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
                placeholder="Optional: .local/fixtures/admin-lifecycle-smoke.pdf"
              />
            </label>
            <label className={styles.field}>
              <span>Or upload initial report (PDF)</span>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  await handleUploadChange(file, "initial");
                }}
              />
              {initialReportUpload && (
                <span className={styles.uploadMeta}>
                  Selected upload: {initialReportUpload.fileName}
                </span>
              )}
            </label>
            <label className={styles.field}>
              <span>Follow-up report path (PDF)</span>
              <Input
                value={followupReportPath}
                onChange={(e) => setFollowupReportPath(e.target.value)}
                placeholder="Optional: .local/fixtures/admin-lifecycle-smoke.pdf"
              />
            </label>
            <label className={styles.field}>
              <span>Or upload follow-up report (PDF)</span>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0] ?? null;
                  await handleUploadChange(file, "followup");
                }}
              />
              {followupReportUpload && (
                <span className={styles.uploadMeta}>
                  Selected upload: {followupReportUpload.fileName}
                </span>
              )}
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
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Optional override (defaults to current environment)"
                />
              </label>
              <label className={styles.field}>
                <span>Origin header</span>
                <Input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Optional override (defaults to current environment)"
                />
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
