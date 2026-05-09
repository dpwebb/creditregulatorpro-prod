import { FormEvent, useMemo, useState } from "react";
import { Bot, Play, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import { Skeleton } from "./Skeleton";
import { Switch } from "./Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import {
  useCreateFeatureFlag,
  useFeatureFlags,
  useUpdateFeatureFlag,
} from "../helpers/featureFlagQueries";
import {
  useAdminAiAssistFindings,
  useAdminAiAssistRuns,
  usePreviewConsumerFindingExplanationAssist,
} from "../helpers/adminAiAssistQueries";
import { useToast } from "../helpers/useToast";
import { formatDateTime } from "../helpers/formatters";
import { AI_CONSUMER_EXPLANATION_FEATURE_KEY } from "../helpers/aiAssistConstants";
import type { OutputType as ConsumerFindingExplanationOutput } from "../endpoints/ai-assist/consumer-finding-explanation_POST.schema";
import styles from "./AdminAiAssistTab.module.css";

interface FlagItem {
  id: number;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  minVersion: string | null;
  maxVersion: string | null;
  scope: "global" | "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

function getRunStatusVariant(status: string): "default" | "success" | "error" | "warning" | "info" {
  if (status === "ok") return "success";
  if (status === "failed") return "error";
  if (status === "unavailable") return "warning";
  if (status === "disabled") return "default";
  return "info";
}

function truncateHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 12)}...${hash.slice(-6)}`;
}

function ExplanationBlock({
  title,
  explanation,
}: {
  title: string;
  explanation: ConsumerFindingExplanationOutput["explanation"];
}) {
  return (
    <div className={styles.explanationBox}>
      <h4 className={styles.explanationTitle}>{title}</h4>
      <p className={styles.explanationLabel}>Summary</p>
      <p className={styles.explanationText}>{explanation.summary}</p>
      <p className={styles.explanationLabel}>Why It Matters</p>
      <p className={styles.explanationText}>{explanation.whyItMatters}</p>
      <p className={styles.explanationLabel}>Next Step</p>
      <p className={styles.explanationText}>{explanation.nextStep}</p>
    </div>
  );
}

export const AdminAiAssistTab = () => {
  const { data: rawFlags, isLoading: isLoadingFlags } = useFeatureFlags();
  const flags = (rawFlags ?? []) as unknown as FlagItem[];
  const aiFlag = useMemo(
    () => flags.find((flag) => flag.key === AI_CONSUMER_EXPLANATION_FEATURE_KEY) ?? null,
    [flags],
  );

  const createFlagMutation = useCreateFeatureFlag();
  const updateFlagMutation = useUpdateFeatureFlag();
  const previewMutation = usePreviewConsumerFindingExplanationAssist();
  const runsQuery = useAdminAiAssistRuns({ limit: 25 });
  const { showSuccess, showError } = useToast();

  const [findingSearch, setFindingSearch] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [violationId, setViolationId] = useState("");
  const [previewResult, setPreviewResult] = useState<ConsumerFindingExplanationOutput | null>(null);
  const findingsQuery = useAdminAiAssistFindings({ q: lookupQuery, limit: 25 });

  const handleCreateFlag = async () => {
    try {
      await createFlagMutation.mutateAsync({
        key: AI_CONSUMER_EXPLANATION_FEATURE_KEY,
        label: "AI consumer explanation assist",
        description:
          "Allows guarded AI rewrites of consumer compliance finding explanations. Default should remain admin scope until approved for consumer UI.",
        scope: "admin",
        enabled: false,
        minVersion: null,
        maxVersion: null,
      });
      showSuccess("AI assist flag created");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create AI assist flag");
    }
  };

  const handleToggleFlag = async (checked: boolean) => {
    if (!aiFlag) return;
    try {
      await updateFlagMutation.mutateAsync({
        id: aiFlag.id,
        enabled: checked,
      });
      showSuccess(`AI assist ${checked ? "enabled" : "disabled"}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to update AI assist flag");
    }
  };

  const handlePreview = async (event: FormEvent) => {
    event.preventDefault();
    const parsedViolationId = Number(violationId);
    if (!Number.isInteger(parsedViolationId) || parsedViolationId <= 0) {
      showError("Enter a valid compliance finding ID");
      return;
    }

    try {
      const result = await previewMutation.mutateAsync({ violationId: parsedViolationId });
      setPreviewResult(result);
      showSuccess(
        result.source === "ai"
          ? "AI explanation generated"
          : "Deterministic fallback returned",
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to preview explanation");
    }
  };

  const handleLookup = (event: FormEvent) => {
    event.preventDefault();
    setLookupQuery(findingSearch.trim());
  };

  const handleUseFinding = (findingId: number) => {
    setViolationId(String(findingId));
    showSuccess(`Finding #${findingId} loaded for preview`);
  };

  const isFlagEnabled = Boolean(aiFlag?.enabled);
  const isAdminScoped = aiFlag?.scope === "admin";

  return (
    <div className={styles.tabContent}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2 className={styles.sectionTitle}>AI Assist</h2>
          <p className={styles.subtitle}>
            Preview guarded AI explanation support without changing ingestion, findings, or packets.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runsQuery.refetch()}
          disabled={runsQuery.isFetching}
        >
          <RefreshCw size={16} /> Refresh Runs
        </Button>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>
                <ShieldCheck size={16} /> Feature Gate
              </h3>
              <p className={styles.panelDescription}>Controls whether AI is allowed past fallback.</p>
            </div>
            {isLoadingFlags ? (
              <Skeleton style={{ width: "88px", height: "28px" }} />
            ) : aiFlag ? (
              <Switch
                checked={aiFlag.enabled}
                onCheckedChange={handleToggleFlag}
                disabled={updateFlagMutation.isPending}
              />
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCreateFlag}
                disabled={createFlagMutation.isPending}
              >
                Create Flag
              </Button>
            )}
          </div>
          <div className={styles.statusRow}>
            <div>
              <div className={styles.statusLabel}>Flag Key</div>
              <div className={styles.flagKey}>{AI_CONSUMER_EXPLANATION_FEATURE_KEY}</div>
            </div>
            {isLoadingFlags ? (
              <Skeleton style={{ width: "76px", height: "24px" }} />
            ) : (
              <Badge
                variant={aiFlag ? (isFlagEnabled ? "success" : "default") : "warning"}
                className={styles.statusBadge}
              >
                {aiFlag ? (isFlagEnabled ? "enabled" : "disabled") : "missing"}
              </Badge>
            )}
          </div>
          {aiFlag && !isAdminScoped && (
            <p className={styles.warningText}>
              Current scope is {aiFlag.scope}. Admin scope is recommended until consumer rollout is approved.
            </p>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>
                <Bot size={16} /> Runtime
              </h3>
              <p className={styles.panelDescription}>Availability is confirmed by running a preview.</p>
            </div>
            <Badge variant="info" className={styles.statusBadge}>
              OpenAI
            </Badge>
          </div>
          <div className={styles.statusRow}>
            <div>
              <div className={styles.statusLabel}>Default Behavior</div>
              <div className={styles.mutedText}>Deterministic fallback unless the flag and provider are available.</div>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>
                <Sparkles size={16} /> Guardrails
              </h3>
              <p className={styles.panelDescription}>AI text is advisory and validated before display.</p>
            </div>
            <Badge variant="success" className={styles.statusBadge}>
              enforced
            </Badge>
          </div>
          <div className={styles.mutedText}>
            Rejects hard legal conclusions, guarantees, and invented dates or amounts.
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle}>
              <Search size={16} /> Finding Lookup
            </h3>
            <p className={styles.panelDescription}>
              Search by finding ID, user email/name, creditor, collection agency, bureau, account fragment, or category.
            </p>
          </div>
          {typeof findingsQuery.data?.total === "number" && (
            <Badge variant="default" className={styles.statusBadge}>
              {findingsQuery.data.total} match{findingsQuery.data.total === 1 ? "" : "es"}
            </Badge>
          )}
        </div>

        <form className={styles.lookupForm} onSubmit={handleLookup}>
          <Input
            value={findingSearch}
            placeholder="Search findings, or leave blank for recent"
            onChange={(event) => setFindingSearch(event.target.value)}
          />
          <Button type="submit" disabled={findingsQuery.isFetching}>
            <Search size={16} /> Search
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={findingsQuery.isFetching}
            onClick={() => {
              setFindingSearch("");
              setLookupQuery("");
            }}
          >
            Recent
          </Button>
        </form>

        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Finding</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className={styles.hideMobile}>Bureau</TableHead>
                <TableHead className={styles.hideMobile}>Detected</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findingsQuery.isLoading || findingsQuery.isFetching ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                    <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                  </TableCell>
                </TableRow>
              ) : !findingsQuery.data?.findings.length ? (
                <TableRow>
                  <TableCell colSpan={6} className={styles.emptyState}>
                    No compliance findings matched.
                  </TableCell>
                </TableRow>
              ) : (
                findingsQuery.data.findings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell>
                      <div className={styles.findingCell}>
                        <span className={styles.flagKey}>Finding #{finding.id}</span>
                        <span className={styles.mutedText}>{finding.displayLabel}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.findingCell}>
                        <span>{finding.userEmail || `User #${finding.userId ?? "-"}`}</span>
                        {finding.userDisplayName && (
                          <span className={styles.mutedText}>{finding.userDisplayName}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={styles.findingCell}>
                        <span>{finding.creditorName || "Unknown account"}</span>
                        <span className={styles.mutedText}>
                          {[finding.accountType, finding.accountNumberMasked].filter(Boolean).join(" · ") || "No account detail"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={styles.hideMobile}>{finding.bureauName || "-"}</TableCell>
                    <TableCell className={styles.hideMobile}>
                      {finding.detectedAt ? formatDateTime(finding.detectedAt) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUseFinding(finding.id)}
                      >
                        Use ID
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <div className={styles.previewGrid}>
        <form className={styles.panel} onSubmit={handlePreview}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>
                <Play size={16} /> Finding Preview
              </h3>
              <p className={styles.panelDescription}>Runs the same backend assist endpoint by finding ID.</p>
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="aiAssistViolationId">
              Compliance Finding ID
            </label>
            <Input
              id="aiAssistViolationId"
              value={violationId}
              inputMode="numeric"
              placeholder="e.g. 123"
              onChange={(event) => setViolationId(event.target.value)}
            />
          </div>
          <div className={styles.buttonRow}>
            <Button type="submit" disabled={previewMutation.isPending}>
              <Sparkles size={16} /> Preview Explanation
            </Button>
          </div>
        </form>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h3 className={styles.panelTitle}>Preview Result</h3>
              <p className={styles.panelDescription}>Returned text is compared against deterministic fallback.</p>
            </div>
          </div>

          {previewMutation.isPending ? (
            <>
              <Skeleton style={{ height: "28px", marginBottom: "var(--spacing-3)" }} />
              <Skeleton style={{ height: "160px" }} />
            </>
          ) : previewResult ? (
            <>
              <div className={styles.resultHeader}>
                <Badge
                  variant={previewResult.source === "ai" ? "success" : "default"}
                  className={styles.statusBadge}
                >
                  {previewResult.source}
                </Badge>
                <Badge
                  variant={getRunStatusVariant(previewResult.status)}
                  className={styles.statusBadge}
                >
                  {previewResult.status}
                </Badge>
                {previewResult.model && (
                  <Badge variant="info" className={styles.statusBadge}>
                    {previewResult.model}
                  </Badge>
                )}
                {previewResult.errorCode && (
                  <Badge variant="warning" className={styles.statusBadge}>
                    {previewResult.errorCode}
                  </Badge>
                )}
              </div>
              <div className={styles.comparisonGrid}>
                <ExplanationBlock title="Returned Explanation" explanation={previewResult.explanation} />
                <ExplanationBlock
                  title="Deterministic Fallback"
                  explanation={previewResult.deterministicFallback}
                />
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>No preview has been run.</div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h3 className={styles.panelTitle}>Recent AI Assist Runs</h3>
            <p className={styles.panelDescription}>Audit records store input hashes, status, provider, and output only.</p>
          </div>
          {typeof runsQuery.data?.total === "number" && (
            <Badge variant="default" className={styles.statusBadge}>
              {runsQuery.data.total} total
            </Badge>
          )}
        </div>

        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className={styles.hideMobile}>Feature</TableHead>
                <TableHead className={styles.hideMobile}>Input Hash</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                    <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                  </TableCell>
                </TableRow>
              ) : !runsQuery.data?.runs.length ? (
                <TableRow>
                  <TableCell colSpan={6} className={styles.emptyState}>
                    No AI assist runs recorded.
                  </TableCell>
                </TableRow>
              ) : (
                runsQuery.data.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{formatDateTime(run.createdAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={getRunStatusVariant(run.status)}
                        className={styles.statusBadge}
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={styles.monoCell}>
                      {run.subjectType}
                      {run.subjectId ? ` #${run.subjectId}` : ""}
                    </TableCell>
                    <TableCell className={`${styles.monoCell} ${styles.hideMobile}`}>
                      {run.featureKey}
                    </TableCell>
                    <TableCell className={`${styles.monoCell} ${styles.hashCell} ${styles.hideMobile}`}>
                      {truncateHash(run.inputHash)}
                    </TableCell>
                    <TableCell className={styles.monoCell}>{run.errorCode || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};
