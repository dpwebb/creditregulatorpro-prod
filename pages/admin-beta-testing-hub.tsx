import { FormEvent, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Clipboard, Save, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Textarea } from "../components/Textarea";
import {
  betaIssueSeverityValues,
  postAdminBetaTestingHubPrompt,
  type InputType as BetaPromptInput,
  type OutputType as BetaPromptOutput,
} from "../endpoints/admin/beta-testing-hub/prompt_POST.schema";
import {
  postAdminBetaTestingHubLog,
  type OutputType as BetaLogOutput,
} from "../endpoints/admin/beta-testing-hub/log_POST.schema";
import styles from "./admin-beta-testing-hub.module.css";

const STAGING_HOSTNAME = "staging.creditregulatorpro.com";

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export default function AdminBetaTestingHubPage() {
  const currentHost = typeof window === "undefined" ? "" : window.location.hostname;
  const isLiveStaging = useMemo(() => currentHost === STAGING_HOSTNAME, [currentHost]);

  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<BetaPromptInput["severity"]>("P2");
  const [area, setArea] = useState("");
  const [stagingUrl, setStagingUrl] = useState("");
  const [observed, setObserved] = useState("");
  const [expected, setExpected] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [notes, setNotes] = useState("");
  const [generated, setGenerated] = useState<BetaPromptOutput | null>(null);
  const [codexReport, setCodexReport] = useState("");
  const [logResult, setLogResult] = useState<BetaLogOutput | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const canGenerate =
    isLiveStaging && title.trim().length >= 3 && observed.trim().length > 0 && !isGenerating;
  const canLog =
    isLiveStaging && Boolean(generated?.issueId) && codexReport.trim().length > 0 && !isLogging;

  const handleGeneratePrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLiveStaging) {
      toast.error("Beta Testing Hub is available on live staging only.");
      return;
    }

    setIsGenerating(true);
    setLogResult(null);
    try {
      const payload: BetaPromptInput = {
        title: title.trim(),
        severity,
        observed: observed.trim(),
        ...(optionalValue(area) ? { area: optionalValue(area) } : {}),
        ...(optionalValue(stagingUrl) ? { stagingUrl: optionalValue(stagingUrl) } : {}),
        ...(optionalValue(expected) ? { expected: optionalValue(expected) } : {}),
        ...(optionalValue(reproductionSteps) ? { reproductionSteps: optionalValue(reproductionSteps) } : {}),
        ...(optionalValue(notes) ? { notes: optionalValue(notes) } : {}),
      };
      const response = await postAdminBetaTestingHubPrompt(payload);
      setGenerated(response);
      toast.success("Beta FIX prompt generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate beta FIX prompt");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!generated?.prompt) return;
    try {
      await navigator.clipboard.writeText(generated.prompt);
      toast.success("Prompt copied.");
    } catch {
      toast.error("Prompt copy failed.");
    }
  };

  const handleLogReport = async () => {
    if (!generated) return;
    setIsLogging(true);
    try {
      const response = await postAdminBetaTestingHubLog({
        issueId: generated.issueId,
        title: title.trim(),
        codexReport: codexReport.trim(),
        generatedPrompt: generated.prompt,
      });
      setLogResult(response);
      toast.success("Codex report logged.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log Codex report");
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Beta Testing Hub | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Beta Testing Hub"
        subtitle="Live staging admin handoff for beta issue prompts and Codex reports."
      />

      <div className={`${styles.notice} ${!isLiveStaging ? styles.lockedNotice : ""}`}>
        FIX generates a Codex prompt only. Final readiness remains pnpm run beta-live:certify and
        SAFE_FOR_BETA_LIVE=true/false.
        {!isLiveStaging && ` Current host: ${currentHost || "unknown"}.`}
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Issue</h2>
          </div>

          <form className={styles.form} onSubmit={handleGeneratePrompt}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Severity</span>
                <select
                  className={styles.select}
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as BetaPromptInput["severity"])}
                  disabled={!isLiveStaging}
                >
                  {betaIssueSeverityValues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Area</span>
                <Input
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Upload, packet, admin, auth"
                  disabled={!isLiveStaging}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Title</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short issue summary"
                disabled={!isLiveStaging}
              />
            </label>

            <label className={styles.field}>
              <span>Staging URL</span>
              <Input
                value={stagingUrl}
                onChange={(event) => setStagingUrl(event.target.value)}
                placeholder="https://staging.creditregulatorpro.com/..."
                disabled={!isLiveStaging}
              />
            </label>

            <label className={styles.field}>
              <span>Observed</span>
              <Textarea
                className={styles.textArea}
                value={observed}
                onChange={(event) => setObserved(event.target.value)}
                placeholder="What happened on staging"
                disabled={!isLiveStaging}
              />
            </label>

            <label className={styles.field}>
              <span>Expected</span>
              <Textarea
                className={styles.textArea}
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="What should happen"
                disabled={!isLiveStaging}
              />
            </label>

            <label className={styles.field}>
              <span>Reproduction steps</span>
              <Textarea
                className={styles.textArea}
                value={reproductionSteps}
                onChange={(event) => setReproductionSteps(event.target.value)}
                placeholder="1. ..."
                disabled={!isLiveStaging}
              />
            </label>

            <label className={styles.field}>
              <span>Notes</span>
              <Textarea
                className={styles.textArea}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Related run, user role, screenshot note"
                disabled={!isLiveStaging}
              />
            </label>

            <div className={styles.actions}>
              <Button type="submit" disabled={!canGenerate}>
                <Wrench size={16} />
                {isGenerating ? "Generating..." : "FIX"}
              </Button>
            </div>
          </form>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Codex Prompt</h2>
            {generated && <span className={styles.meta}>{generated.issueId}</span>}
          </div>

          {generated ? (
            <div className={styles.form}>
              <Textarea className={styles.promptArea} value={generated.prompt} readOnly />
              <div className={styles.actions}>
                <Button variant="secondary" onClick={handleCopyPrompt}>
                  <Clipboard size={16} />
                  Copy Prompt
                </Button>
                <span className={styles.statusLine}>{generated.promptSource}</span>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>No prompt generated yet.</div>
          )}
        </section>

        <section className={`${styles.panel} ${styles.fullWidth}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Codex Report</h2>
            {logResult && <span className={styles.meta}>{logResult.logId}</span>}
          </div>

          <div className={styles.form}>
            <Textarea
              className={styles.reportArea}
              value={codexReport}
              onChange={(event) => setCodexReport(event.target.value)}
              placeholder="Paste Codex's report here"
              disabled={!isLiveStaging || !generated}
            />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={handleLogReport} disabled={!canLog}>
                <Save size={16} />
                {isLogging ? "Logging..." : "Log Report"}
              </Button>
              {logResult && (
                <span className={styles.statusLine}>
                  Logged {new Date(logResult.loggedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
