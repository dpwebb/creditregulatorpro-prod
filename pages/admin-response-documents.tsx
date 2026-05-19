import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Filter,
  Inbox,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { format } from "../helpers/dateUtils";
import {
  BureauResponseChannelArrayValues,
  BureauResponseDocumentTypeArrayValues,
  BureauResponseStatusArrayValues,
  type BureauResponseChannel,
  type BureauResponseDocumentType,
  type BureauResponseStatus,
} from "../helpers/schema";
import {
  useResponseDocument,
  useResponseDocumentAdminReviewMutation,
  useResponseCaptureMutation,
  useResponseDocuments,
  useResponseProcessingMetrics,
  type ResponseAdminReviewInput,
  type ResponseCaptureOutput,
  type ResponseDocumentListInput,
} from "../helpers/responseDocumentQueries";
import { useAdminUserDetail, useAdminUsers, type AdminUserDetailOutput } from "../helpers/adminQueries";
import type { OutputType as ResponseGetOutput } from "../endpoints/responses/get_GET.schema";
import type { OutputType as ResponseListOutput } from "../endpoints/responses/list_GET.schema";
import styles from "./admin-response-documents.module.css";

type ResponseRecord = ResponseListOutput["responses"][number];
type ResponseDetail = ResponseGetOutput["response"];
type ResponseReviewAction = ResponseAdminReviewInput["reviewAction"];
type ResponseReviewActionOption = Exclude<ResponseReviewAction, "link_to_packet">;
type CaptureResult = ResponseCaptureOutput;

type FilterState = {
  responseChannel: string;
  responseDocumentType: string;
  responseStatus: string;
  packetId: string;
  disputePacketFindingId: string;
  findingOutcomeId: string;
  comparisonRunId: string;
  bureauId: string;
  agencyId: string;
  startDate: string;
  endDate: string;
  limit: string;
  offset: string;
};

type CaptureFormState = {
  userSearch: string;
  userId: string;
  packetId: string;
  disputePacketFindingId: string;
  findingOutcomeId: string;
  comparisonRunId: string;
  bureauId: string;
  agencyId: string;
  senderType: "bureau" | "creditor" | "collector";
  intakeSourceType: "manual_admin" | "simulated_inbox";
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseReceivedAt: string;
  responseSource: string;
  responseSubject: string;
  responseSenderDomain: string;
  responseReferenceId: string;
  responseText: string;
  artifactName: string;
  artifactSha256: string;
  artifactReference: string;
  ocrFallbackUsed: boolean;
};

const EMPTY_FILTERS: FilterState = {
  responseChannel: "",
  responseDocumentType: "",
  responseStatus: "",
  packetId: "",
  disputePacketFindingId: "",
  findingOutcomeId: "",
  comparisonRunId: "",
  bureauId: "",
  agencyId: "",
  startDate: "",
  endDate: "",
  limit: "50",
  offset: "0",
};

const EMPTY_CAPTURE_FORM: CaptureFormState = {
  userSearch: "",
  userId: "",
  packetId: "",
  disputePacketFindingId: "",
  findingOutcomeId: "",
  comparisonRunId: "",
  bureauId: "",
  agencyId: "",
  senderType: "bureau",
  intakeSourceType: "manual_admin",
  responseChannel: "manual_record",
  responseDocumentType: "bureau_letter_response",
  responseReceivedAt: new Date().toISOString().slice(0, 10),
  responseSource: "manual_admin",
  responseSubject: "",
  responseSenderDomain: "",
  responseReferenceId: "",
  responseText: "",
  artifactName: "",
  artifactSha256: "",
  artifactReference: "",
  ocrFallbackUsed: false,
};

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|raw.?text|raw.?extracted|extracted.?text|pdf.?text|report.?text|email.?body|full.?email|packet.?body|storage.?url|signed.?url|token|api.?key|private.?key|database.?url|cookie|session|mailbox.?credential|email.?auth)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{10,}\b/g;
const RAW_OR_SECRET_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|packet body|bucket:\/\/|s3:\/\/|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|storageurl|storage_url|session=|cookie=|api[_-]?key|private key|database_url|postgres:\/\/|mailbox password|imap password|smtp password|email auth token|oauth refresh token)/i;
const LEGAL_CONCLUSION_PATTERN =
  /\b(equifax admitted fault|the bureau corrected the item|the bureau violated the law|you won|you are entitled to damages|this proves correction|this is legal proof|the agency must pay|confirmed legal violation|legal violation|admitted fault|mark corrected|mark removed|mark unchanged|demand|enforce)\b/i;
const HASH_KEY_PATTERN = /hash/i;
const HASH_VALUE_PATTERN = /^[a-f0-9]{32,128}$/i;
const REVIEW_NOTE_SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/i;
const REVIEW_NOTE_ACCOUNT_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b/i;
const REVIEW_NOTE_LONG_NUMBER_PATTERN = /\b(?:\d[ -]?){12,19}\b/i;
const REVIEW_NOTE_RAW_SECRET_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|packet body|bucket:\/\/|s3:\/\/|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|storageurl|storage_url|session=|cookie=|api[_-]?key|private key|database_url|postgres:\/\/|mailbox password|imap password|smtp password|email auth token|oauth refresh token|bearer\s+[a-z0-9._-]+)/i;

const REVIEW_ACTION_LABELS: Record<ResponseReviewActionOption, string> = {
  mark_needs_review: "Mark Needs Review",
  mark_related: "Mark Related",
  mark_unrelated: "Mark Unrelated",
  archive_response: "Archive Response",
  link_to_outcome: "Link To Outcome",
  add_review_note: "Add Review Note",
};

const REVIEW_ACTIONS: ResponseReviewActionOption[] = [
  "mark_needs_review",
  "mark_related",
  "mark_unrelated",
  "archive_response",
  "link_to_outcome",
  "add_review_note",
];

function formatEnum(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

function formatDate(value: Date | string | null | undefined): string {
  return value ? format(value, "MMM d, yyyy h:mm a") : "-";
}

function cleanInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanOffset(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function cleanDate(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const parsed = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function filtersToInput(filters: FilterState): ResponseDocumentListInput {
  return {
    responseChannel: (filters.responseChannel || undefined) as BureauResponseChannel | undefined,
    responseDocumentType: (filters.responseDocumentType || undefined) as BureauResponseDocumentType | undefined,
    responseStatus: (filters.responseStatus || undefined) as BureauResponseStatus | undefined,
    packetId: cleanInteger(filters.packetId),
    disputePacketFindingId: cleanInteger(filters.disputePacketFindingId),
    findingOutcomeId: cleanInteger(filters.findingOutcomeId),
    comparisonRunId: cleanInteger(filters.comparisonRunId),
    bureauId: cleanInteger(filters.bureauId),
    agencyId: cleanInteger(filters.agencyId),
    startDate: cleanDate(filters.startDate),
    endDate: cleanDate(filters.endDate),
    limit: cleanInteger(filters.limit) ?? 50,
    offset: cleanOffset(filters.offset) ?? 0,
  };
}

function statusVariant(value: string | null | undefined) {
  if (value === "linked_to_packet" || value === "linked_to_outcome") return "success";
  if (value === "needs_review") return "warning";
  if (value === "archived" || value === "rejected_as_unrelated") return "default";
  return "info";
}

function channelVariant(value: string | null | undefined) {
  if (value === "email") return "info";
  if (value === "mail" || value === "portal") return "success";
  if (value === "unknown") return "warning";
  return "default";
}

function classificationVariant(value: string | null | undefined) {
  if (value === "verified_deleted" || value === "unable_to_verify") return "success";
  if (value === "updated") return "info";
  if (value === "remains" || value === "frivolous" || value === "duplicate" || value === "suspicious_non_compliant") return "warning";
  return "default";
}

function percent(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}

function sanitizeText(value: string, key?: string): string {
  if (key && HASH_KEY_PATTERN.test(key) && HASH_VALUE_PATTERN.test(value)) return value;
  if (RAW_OR_SECRET_PATTERN.test(value) || LEGAL_CONCLUSION_PATTERN.test(value)) return "[redacted]";
  return value
    .replace(SIN_PATTERN, "[redacted SIN]")
    .replace(ACCOUNT_PHRASE_PATTERN, "[redacted account]")
    .replace(LONG_NUMBER_PATTERN, (match) => `...${match.slice(-4)}`);
}

function safeValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "-";
  if (key && SENSITIVE_KEY_PATTERN.test(key) && !(HASH_KEY_PATTERN.test(key) && typeof value === "string")) {
    return "[redacted]";
  }
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "string") return sanitizeText(value, key);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return sanitizeText(JSON.stringify(value), key);
}

function DetailRow({ label, value, fieldKey }: { label: string; value: unknown; fieldKey?: string }) {
  return (
    <div className={styles.detailRow}>
      <span>{label}</span>
      <strong>{safeValue(value, fieldKey)}</strong>
    </div>
  );
}

function MetadataBlock({
  label,
  value,
  fieldKey,
  monospace = false,
}: {
  label: string;
  value: unknown;
  fieldKey?: string;
  monospace?: boolean;
}) {
  return (
    <div className={styles.metadataBlock}>
      <span>{label}</span>
      <p className={monospace ? styles.hashText : undefined}>{safeValue(value, fieldKey)}</p>
    </div>
  );
}

function SafetyBanner() {
  return (
    <div className={styles.safetyBanner}>
      <ShieldCheck size={18} />
      <div>
        <strong>Response documents keep immutable evidence plus append-only deterministic processing.</strong>
        <span>Response classifications are intake outcomes only; later credit-report comparison remains required before source-truth outcomes change.</span>
        <span>Deterministic response parsing runs without AI dependency, and fallback extraction is disabled unless explicitly approved.</span>
        <span>This page does not change canonical report facts.</span>
        <span>This page does not change packet readiness or wording.</span>
        <span>This page does not activate regulation runtime truth.</span>
        <span>No mailbox, Gmail, IMAP, or inbox integration is used.</span>
      </div>
    </div>
  );
}

function EvidenceNotice() {
  return (
    <div className={styles.evidenceNotice}>
      <ShieldCheck size={18} />
      <span>
        Response captured and classified deterministically. Later credit-report comparison is still required before corrected, removed, or unchanged source-truth outcomes can change.
      </span>
    </div>
  );
}

function ResponseCapturePanel({ onCaptured }: { onCaptured: (responseId: number) => void }) {
  const [form, setForm] = useState<CaptureFormState>(EMPTY_CAPTURE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const userQuery = useAdminUsers({
    role: "user",
    search: form.userSearch.trim() || undefined,
    limit: 25,
    offset: 0,
  });
  const selectedUserId = cleanInteger(form.userId);
  const userDetailQuery = useAdminUserDetail(selectedUserId);
  const captureMutation = useResponseCaptureMutation();
  const selectedResponse = captureResult?.response ?? null;

  const update = <K extends keyof CaptureFormState>(key: K, value: CaptureFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError(null);
  };

  const choosePacket = (packetId: string) => {
    const packet = userDetailQuery.data?.packets.find((item) => String(item.id) === packetId);
    setForm((current) => ({
      ...current,
      packetId,
      responseSource: packet?.creditorName ?? packet?.originalCreditorName ?? current.responseSource,
    }));
    setFormError(null);
  };

  const submitCapture = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setCaptureResult(null);

    const userId = cleanInteger(form.userId);
    if (!userId) {
      setFormError("Select a consumer before capturing a response.");
      return;
    }
    const responseTextError = validateCaptureResponseText(form.responseText);
    if (responseTextError) {
      setFormError(responseTextError);
      return;
    }
    if (!form.responseReceivedAt.trim()) {
      setFormError("Response date is required.");
      return;
    }

    const rawArtifactMetadata: Record<string, unknown> = {
      captureMode: form.intakeSourceType,
      ocrFallbackUsed: form.ocrFallbackUsed,
    };
    if (form.artifactName.trim()) rawArtifactMetadata.artifactName = form.artifactName.trim();
    if (form.artifactSha256.trim()) rawArtifactMetadata.artifactSha256 = form.artifactSha256.trim();
    if (form.artifactReference.trim()) rawArtifactMetadata.artifactReference = form.artifactReference.trim();

    try {
      const result = await captureMutation.mutateAsync({
        intakeSourceType: form.intakeSourceType,
        userId,
        packetId: cleanInteger(form.packetId) ?? null,
        disputePacketFindingId: cleanInteger(form.disputePacketFindingId) ?? null,
        findingOutcomeId: cleanInteger(form.findingOutcomeId) ?? null,
        comparisonRunId: cleanInteger(form.comparisonRunId) ?? null,
        bureauId: cleanInteger(form.bureauId) ?? null,
        agencyId: cleanInteger(form.agencyId) ?? null,
        responseChannel: form.responseChannel,
        responseDocumentType: form.responseDocumentType,
        responseReceivedAt: new Date(`${form.responseReceivedAt}T00:00:00.000Z`),
        responseSource: form.responseSource.trim() || form.intakeSourceType,
        responseSubject: form.responseSubject.trim() || null,
        responseSenderDomain: form.responseSenderDomain.trim() || null,
        responseReferenceId: form.responseReferenceId.trim() || null,
        responseText: form.responseText.trim(),
        responseStatus: "received",
        rawArtifactMetadata,
        normalizedResponseMetadata: {
          senderType: form.senderType,
          sourceType: form.intakeSourceType,
          captureUi: "admin-response-documents",
        },
        sourceMetadata: {
          uiSource: "admin_response_capture",
          senderType: form.senderType,
          liveMailboxIntegrationUsed: false,
        },
      } as any);

      setCaptureResult(result);
      onCaptured(result.response.id);
      if (result.intake?.status !== "duplicate") {
        setForm((current) => ({
          ...EMPTY_CAPTURE_FORM,
          userSearch: current.userSearch,
          userId: current.userId,
          responseReceivedAt: new Date().toISOString().slice(0, 10),
        }));
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to capture response.");
    }
  };

  return (
    <section className={styles.capturePanel} aria-label="Manual response capture">
      <div className={styles.reviewHeader}>
        <Inbox size={18} />
        <div>
          <h2>Manual Response Capture</h2>
          <p>Admin-only intake for manual or simulated response records. Live mailbox connections remain disabled.</p>
        </div>
      </div>

      <div className={styles.reviewNotice}>
        <ShieldCheck size={18} />
        <div>
          <span>Response text is used only for deterministic intake classification and hashing.</span>
          <span>Do not enter full SINs, full account numbers, mailbox credentials, raw report dumps, or legal conclusions.</span>
          <span>Submitting this form does not change canonical report facts, violation truth, packet readiness, or packet wording.</span>
        </div>
      </div>

      <form className={styles.captureForm} onSubmit={submitCapture}>
        <div className={styles.captureGrid}>
          <label className={styles.reviewField}>
            <span>Search consumer</span>
            <input
              value={form.userSearch}
              onChange={(event) => update("userSearch", event.target.value)}
              placeholder="Search by name or email"
            />
          </label>
          <label className={styles.reviewField}>
            <span>Consumer</span>
            <select value={form.userId} onChange={(event) => update("userId", event.target.value)}>
              <option value="">Select consumer</option>
              {(userQuery.data?.users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName || `User ${user.id}`} - #{user.id}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Existing packet</span>
            <select value={form.packetId} onChange={(event) => choosePacket(event.target.value)} disabled={!selectedUserId || userDetailQuery.isLoading}>
              <option value="">No packet link</option>
              {(userDetailQuery.data?.packets ?? []).map((packet) => (
                <option key={packet.id} value={packet.id}>{packetLabel(packet)}</option>
              ))}
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Capture packet ID</span>
            <input value={form.packetId} onChange={(event) => update("packetId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Capture packet finding ID</span>
            <input value={form.disputePacketFindingId} onChange={(event) => update("disputePacketFindingId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Capture finding outcome ID</span>
            <input value={form.findingOutcomeId} onChange={(event) => update("findingOutcomeId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Capture comparison run ID</span>
            <input value={form.comparisonRunId} onChange={(event) => update("comparisonRunId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Sender type</span>
            <select value={form.senderType} onChange={(event) => update("senderType", event.target.value as CaptureFormState["senderType"])}>
              <option value="bureau">Bureau</option>
              <option value="creditor">Creditor</option>
              <option value="collector">Collector</option>
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Intake source</span>
            <select value={form.intakeSourceType} onChange={(event) => update("intakeSourceType", event.target.value as CaptureFormState["intakeSourceType"])}>
              <option value="manual_admin">Manual admin</option>
              <option value="simulated_inbox">Simulated inbox</option>
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Capture response channel</span>
            <select value={form.responseChannel} onChange={(event) => update("responseChannel", event.target.value as BureauResponseChannel)}>
              {BureauResponseChannelArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Capture document type</span>
            <select value={form.responseDocumentType} onChange={(event) => update("responseDocumentType", event.target.value as BureauResponseDocumentType)}>
              {BureauResponseDocumentTypeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.reviewField}>
            <span>Response date</span>
            <input type="date" value={form.responseReceivedAt} onChange={(event) => update("responseReceivedAt", event.target.value)} />
          </label>
          <label className={styles.reviewField}>
            <span>Source name</span>
            <input value={form.responseSource} onChange={(event) => update("responseSource", event.target.value)} placeholder="Equifax, TransUnion, creditor, collector" />
          </label>
          <label className={styles.reviewField}>
            <span>Capture bureau ID</span>
            <input value={form.bureauId} onChange={(event) => update("bureauId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Capture agency ID</span>
            <input value={form.agencyId} onChange={(event) => update("agencyId", event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Sender domain</span>
            <input value={form.responseSenderDomain} onChange={(event) => update("responseSenderDomain", event.target.value)} placeholder="example.test" />
          </label>
          <label className={styles.reviewField}>
            <span>Reference ID</span>
            <input value={form.responseReferenceId} onChange={(event) => update("responseReferenceId", event.target.value)} />
          </label>
          <label className={styles.reviewField}>
            <span>Subject</span>
            <input value={form.responseSubject} onChange={(event) => update("responseSubject", event.target.value)} />
          </label>
          <label className={styles.reviewField}>
            <span>Artifact name</span>
            <input value={form.artifactName} onChange={(event) => update("artifactName", event.target.value)} placeholder="response-letter.pdf" />
          </label>
          <label className={styles.reviewField}>
            <span>Artifact SHA-256</span>
            <input value={form.artifactSha256} onChange={(event) => update("artifactSha256", event.target.value)} />
          </label>
          <label className={styles.reviewField}>
            <span>Artifact reference</span>
            <input value={form.artifactReference} onChange={(event) => update("artifactReference", event.target.value)} />
          </label>
        </div>

        <label className={styles.reviewField}>
          <span>Response text</span>
          <textarea
            value={form.responseText}
            onChange={(event) => update("responseText", event.target.value)}
            placeholder="Paste safe response wording only. Do not paste raw report text, secrets, full account numbers, or full SINs."
            rows={5}
          />
        </label>

        <label className={styles.confirmationRow}>
          <input
            type="checkbox"
            checked={form.ocrFallbackUsed}
            onChange={(event) => update("ocrFallbackUsed", event.target.checked)}
          />
          <span>Artifact metadata indicates OCR fallback was used.</span>
        </label>

        {formError ? (
          <div className={styles.reviewError} role="alert">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        ) : null}

        {selectedResponse ? (
          <div className={styles.captureResult} role="status">
            <div className={styles.captureResultHeader}>
              <ClipboardList size={18} />
              <div>
                <strong>{captureResult?.intake?.status === "duplicate" ? "Duplicate intake matched existing response" : "Response captured"}</strong>
                <span>Response #{selectedResponse.id}</span>
              </div>
            </div>
            <ProcessingSummary response={selectedResponse} />
            <div className={styles.detailGrid}>
              <DetailRow label="Classification" value={formatEnum(selectedResponse.latestClassification)} />
              <DetailRow label="Confidence" value={percent(selectedResponse.latestClassificationConfidence)} />
              <DetailRow label="Extraction source" value={formatEnum(selectedResponse.latestExtractionSource)} />
              <DetailRow label="Manual review" value={selectedResponse.latestRequiresManualReview ? "required" : "not required"} />
            </div>
            {selectedResponse.latestRequiresManualReview ? (
              <div className={styles.warningBox}>
                <AlertTriangle size={16} />
                <span>Manual review is required before this response can influence any downstream outcome.</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.reviewActions}>
          <Button type="submit" disabled={captureMutation.isPending}>
            <Send size={16} />
            Submit Response Intake
          </Button>
        </div>
      </form>
    </section>
  );
}

function ProcessingSummary({ response }: { response: ResponseRecord | ResponseDetail }) {
  return (
    <div className={styles.processingSummary}>
      <Badge variant={classificationVariant(response.latestClassification)}>{formatEnum(response.latestClassification)}</Badge>
      <span>{percent(response.latestClassificationConfidence)} confidence</span>
      <span>{formatEnum(response.latestExtractionSource)}</span>
      {response.latestRequiresManualReview ? (
        <span className={styles.manualReviewFlag}>Manual review</span>
      ) : (
        <span>Deterministic complete</span>
      )}
    </div>
  );
}

function ResponseProcessingBlock({ response }: { response: ResponseDetail }) {
  const event = response.latestProcessingEvent;
  const rationale = Array.isArray(event?.rationale) ? event.rationale : [];
  const uncertaintyCodes = Array.isArray(event?.uncertaintyCodes) ? event.uncertaintyCodes : [];
  const regulationReferences = Array.isArray(event?.regulationReferences) ? event.regulationReferences : [];

  return (
    <section className={styles.processingPanel}>
      <div className={styles.reviewHeader}>
        <Activity size={18} />
        <div>
          <h3>Deterministic Response Processing</h3>
          <p>Append-only intake result. No packet readiness, violation truth, or report parser facts are changed.</p>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Classification" value={formatEnum(response.latestClassification)} />
        <DetailRow label="Confidence" value={percent(response.latestClassificationConfidence)} />
        <DetailRow label="Extraction source" value={formatEnum(response.latestExtractionSource)} />
        <DetailRow label="Manual review" value={response.latestRequiresManualReview ? "required" : "not required"} />
        <DetailRow label="Processing status" value={formatEnum(response.latestProcessingStatus)} />
        <DetailRow label="Processed at" value={formatDate(response.latestProcessingCreatedAt)} />
      </div>

      {response.latestRequiresManualReview ? (
        <div className={styles.warningBox}>
          <AlertTriangle size={18} />
          <span>Uncertain or adverse response state remains unresolved until an admin review or later deterministic comparison supports a change.</span>
        </div>
      ) : null}

      {event ? (
        <>
          <div className={styles.metadataGrid}>
            <MetadataBlock label="Parser version" value={event.parserVersion} />
            <MetadataBlock label="Rule ID" value={event.classifierRuleId} />
            <MetadataBlock label="Readiness impact" value={event.readinessImpact?.notes ?? "No readiness mutation."} />
            <MetadataBlock label="Violation impact" value={event.violationImpact?.notes ?? "No violation truth mutation."} />
          </div>
          {uncertaintyCodes.length > 0 ? (
            <div className={styles.codeList}>
              <span>Uncertainty</span>
              <div className={styles.badgeRow}>
                {uncertaintyCodes.map((code) => (
                  <Badge key={String(code)} variant="warning">{formatEnum(String(code))}</Badge>
                ))}
              </div>
            </div>
          ) : null}
          {rationale.length > 0 ? (
            <div className={styles.rationaleList}>
              <span>Evidence-Linked Rationale</span>
              {rationale.map((item, index) => {
                const record = item as Record<string, unknown>;
                return (
                  <p key={`${String(record.code ?? "rationale")}-${index}`}>
                    {safeValue(record.message, "rationale")} ({percent(Number(record.confidence ?? 0))})
                  </p>
                );
              })}
            </div>
          ) : null}
          {regulationReferences.length > 0 ? (
            <div className={styles.rationaleList}>
              <span>Reference Review Links</span>
              {regulationReferences.map((item, index) => {
                const record = item as Record<string, unknown>;
                return (
                  <p key={`${String(record.regulationId ?? "regulation")}-${index}`}>
                    This item may require review under {safeValue(record.citation)}.
                  </p>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.warningBox}>
          <AlertTriangle size={18} />
          <span>No processing event is attached. Treat this response as manual review until replayed.</span>
        </div>
      )}
    </section>
  );
}

function MetricsStrip() {
  const metricsQuery = useResponseProcessingMetrics({ lookbackHours: 24 });
  const metrics = metricsQuery.data?.metrics;
  const activeAlerts = metrics?.alerts.filter((alert) => alert.active) ?? [];

  if (metricsQuery.isError) {
    return (
      <div className={styles.warningBox} role="alert">
        <AlertTriangle size={18} />
        <span>{metricsQuery.error instanceof Error ? metricsQuery.error.message : "Unable to load response metrics."}</span>
      </div>
    );
  }

  return (
    <section className={styles.metricsStrip} aria-label="Response processing metrics">
      <div className={styles.metricCell}>
        <span>Processed 24h</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.processed ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Manual Review</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.manualReview ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Suspicious</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.suspicious ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Failed</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.failed ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>OCR Fallback</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.ocrFallback ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Readiness Regression</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.readinessRegression ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Dead Letters</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.deadLetters ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Queue Queued</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.queueHealth.queuedJobs ?? 0}</strong>
      </div>
      <div className={(metrics?.queueHealth.failedJobs ?? 0) > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Queue Failed</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.queueHealth.failedJobs ?? 0}</strong>
      </div>
      <div className={(metrics?.queueHealth.deadLetteredJobs ?? 0) > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Queue Dead</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.queueHealth.deadLetteredJobs ?? 0}</strong>
      </div>
      <div className={(metrics?.queueHealth.staleRunningJobs ?? 0) > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Queue Stale</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.queueHealth.staleRunningJobs ?? 0}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Workflow Stalls</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.totals.workflowStalls ?? 0}</strong>
      </div>
      <div className={activeAlerts.length > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Active Alerts</span>
        <strong>{metricsQuery.isLoading ? "-" : activeAlerts.length}</strong>
      </div>
      <div className={styles.metricCell}>
        <span>Replayable</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.replayReadiness.replayableRecords ?? 0}</strong>
      </div>
      <div className={(metrics?.replayReadiness.nonReplayableRecords ?? 0) > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Non-Replayable</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.replayReadiness.nonReplayableRecords ?? 0}</strong>
      </div>
      <div className={(metrics?.replayReadiness.staleOrMissingClassifierMetadata ?? 0) > 0 ? styles.metricAlert : styles.metricCell}>
        <span>Replay Stale</span>
        <strong>{metricsQuery.isLoading ? "-" : metrics?.replayReadiness.staleOrMissingClassifierMetadata ?? 0}</strong>
      </div>
    </section>
  );
}

function defaultIdValue(value: number | null | undefined): string {
  return value ? String(value) : "";
}

function validateReviewNotes(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (REVIEW_NOTE_SIN_PATTERN.test(trimmed)) return "Review notes cannot include full SIN-like values.";
  if (REVIEW_NOTE_ACCOUNT_PATTERN.test(trimmed) || REVIEW_NOTE_LONG_NUMBER_PATTERN.test(trimmed)) {
    return "Review notes cannot include full unmasked account-like values.";
  }
  if (REVIEW_NOTE_RAW_SECRET_PATTERN.test(trimmed)) {
    return "Review notes cannot include raw text, storage paths, signed URLs, cookies, tokens, keys, database URLs, or mailbox credentials.";
  }
  if (LEGAL_CONCLUSION_PATTERN.test(trimmed)) return "Review notes cannot include legal-conclusion language.";
  return null;
}

function validateCaptureResponseText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Response text is required.";
  if (trimmed.length > 4000) return "Response text must be 4000 characters or fewer.";
  if (REVIEW_NOTE_SIN_PATTERN.test(trimmed)) return "Response text cannot include full SIN-like values.";
  if (REVIEW_NOTE_ACCOUNT_PATTERN.test(trimmed) || REVIEW_NOTE_LONG_NUMBER_PATTERN.test(trimmed)) {
    return "Response text cannot include full unmasked account-like values.";
  }
  if (REVIEW_NOTE_RAW_SECRET_PATTERN.test(trimmed)) {
    return "Response text cannot include raw report dumps, storage paths, signed URLs, cookies, tokens, keys, database URLs, or mailbox credentials.";
  }
  if (LEGAL_CONCLUSION_PATTERN.test(trimmed)) return "Response text cannot include legal-conclusion language.";
  return null;
}

function packetLabel(packet: AdminUserDetailOutput["packets"][number]): string {
  const parts = [
    `#${packet.id}`,
    packet.type ? formatEnum(packet.type) : null,
    packet.creditorName ?? packet.originalCreditorName,
    packet.terminalLabel,
  ].filter(Boolean);
  return parts.join(" - ");
}

function hasAnyLink(values: Array<number | undefined>): boolean {
  return values.some((value) => Number.isInteger(value) && Number(value) > 0);
}

function ResponseAdminReviewControls({ response }: { response: ResponseDetail }) {
  const adminReviewMutation = useResponseDocumentAdminReviewMutation();
  const [reviewAction, setReviewAction] = useState<ResponseReviewActionOption>("add_review_note");
  const [reviewNotes, setReviewNotes] = useState("");
  const [packetId, setPacketId] = useState(defaultIdValue(response.packetId));
  const [disputePacketFindingId, setDisputePacketFindingId] = useState(defaultIdValue(response.disputePacketFindingId));
  const [comparisonRunId, setComparisonRunId] = useState(defaultIdValue(response.comparisonRunId));
  const [findingOutcomeId, setFindingOutcomeId] = useState(defaultIdValue(response.findingOutcomeId));
  const [confirmEvidenceOnly, setConfirmEvidenceOnly] = useState(false);
  const [confirmNoCanonicalChange, setConfirmNoCanonicalChange] = useState(false);
  const [confirmNoOutcomeClassification, setConfirmNoOutcomeClassification] = useState(false);
  const [explicitConfirmation, setExplicitConfirmation] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setReviewAction("add_review_note");
    setReviewNotes("");
    setPacketId(defaultIdValue(response.packetId));
    setDisputePacketFindingId(defaultIdValue(response.disputePacketFindingId));
    setComparisonRunId(defaultIdValue(response.comparisonRunId));
    setFindingOutcomeId(defaultIdValue(response.findingOutcomeId));
    setConfirmEvidenceOnly(false);
    setConfirmNoCanonicalChange(false);
    setConfirmNoOutcomeClassification(false);
    setExplicitConfirmation(false);
    setFormError(null);
    setSuccessMessage(null);
  }, [
    response.id,
    response.packetId,
    response.disputePacketFindingId,
    response.comparisonRunId,
    response.findingOutcomeId,
  ]);

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const notes = reviewNotes.trim();
    const sanitizedNotesError = validateReviewNotes(notes);
    const cleanPacketId = cleanInteger(packetId);
    const cleanDisputePacketFindingId = cleanInteger(disputePacketFindingId);
    const cleanComparisonRunId = cleanInteger(comparisonRunId);
    const cleanFindingOutcomeId = cleanInteger(findingOutcomeId);

    if (sanitizedNotesError) {
      setFormError(sanitizedNotesError);
      return;
    }

    if (reviewAction !== "archive_response" && !notes) {
      setFormError(`${REVIEW_ACTION_LABELS[reviewAction]} requires review notes.`);
      return;
    }

    if (reviewAction === "archive_response" && !notes && !explicitConfirmation) {
      setFormError("Archive Response requires review notes or explicit archive confirmation.");
      return;
    }

    if (!confirmEvidenceOnly || !confirmNoCanonicalChange || !confirmNoOutcomeClassification) {
      setFormError("All evidence-only, canonical-fact, and outcome-classification confirmations are required.");
      return;
    }

    if (reviewAction === "mark_related") {
      const relatedLinkExists = hasAnyLink([
        cleanPacketId,
        cleanDisputePacketFindingId,
        cleanComparisonRunId,
        cleanFindingOutcomeId,
        response.packetId ?? undefined,
        response.disputePacketFindingId ?? undefined,
        response.comparisonRunId ?? undefined,
        response.findingOutcomeId ?? undefined,
      ]);
      if (!relatedLinkExists) {
        setFormError("Mark Related requires an existing or supplied packet, outcome, or finding link.");
        return;
      }
    }

    if (reviewAction === "link_to_outcome" && !hasAnyLink([
      cleanComparisonRunId,
      cleanFindingOutcomeId,
      response.comparisonRunId ?? undefined,
      response.findingOutcomeId ?? undefined,
    ])) {
      setFormError("Link To Outcome requires a comparison run ID or finding outcome ID.");
      return;
    }

    const payload: ResponseAdminReviewInput = {
      responseId: response.id,
      reviewAction,
      reviewNotes: notes || undefined,
      confirmEvidenceOnly,
      confirmNoCanonicalChange,
      confirmNoOutcomeClassification,
      explicitConfirmation: reviewAction === "archive_response" ? explicitConfirmation : undefined,
    };

    if (reviewAction === "mark_related") {
      payload.packetId = cleanPacketId;
      payload.disputePacketFindingId = cleanDisputePacketFindingId;
      payload.comparisonRunId = cleanComparisonRunId;
      payload.findingOutcomeId = cleanFindingOutcomeId;
    }

    if (reviewAction === "link_to_outcome") {
      payload.comparisonRunId = cleanComparisonRunId;
      payload.findingOutcomeId = cleanFindingOutcomeId;
    }

    try {
      await adminReviewMutation.mutateAsync(payload);
      setSuccessMessage("Response review metadata saved.");
      setReviewNotes("");
      setExplicitConfirmation(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save response review metadata.");
    }
  };

  return (
    <section className={styles.reviewPanel} aria-label="Response admin review controls">
      <div className={styles.reviewHeader}>
        <MessageSquare size={18} />
        <div>
          <h3>Admin Metadata Review</h3>
          <p>Admin review updates response metadata only.</p>
        </div>
      </div>

      <div className={styles.reviewNotice}>
        <ShieldCheck size={18} />
        <div>
          <span>Response documents remain evidence and metadata only.</span>
          <span>A later credit-report comparison is still required to classify corrected, removed, or unchanged outcomes.</span>
          <span>This does not change canonical report facts.</span>
          <span>This does not change packet readiness or wording.</span>
          <span>This does not create an admin override.</span>
        </div>
      </div>

      <form className={styles.reviewForm} onSubmit={submitReview}>
        <label className={styles.reviewField}>
          <span>Review action</span>
          <select value={reviewAction} onChange={(event) => setReviewAction(event.target.value as ResponseReviewActionOption)}>
            {REVIEW_ACTIONS.map((action) => (
              <option key={action} value={action}>{REVIEW_ACTION_LABELS[action]}</option>
            ))}
          </select>
        </label>

        <label className={styles.reviewField}>
          <span>Review notes</span>
          <textarea
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
            placeholder="Use neutral metadata-only notes. Later report comparison required."
            rows={4}
          />
        </label>

        <div className={styles.reviewLinkGrid} aria-label="Optional review links">
          <label className={styles.reviewField}>
            <span>Review packet ID</span>
            <input value={packetId} onChange={(event) => setPacketId(event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Review packet finding ID</span>
            <input value={disputePacketFindingId} onChange={(event) => setDisputePacketFindingId(event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Review comparison run ID</span>
            <input value={comparisonRunId} onChange={(event) => setComparisonRunId(event.target.value)} inputMode="numeric" />
          </label>
          <label className={styles.reviewField}>
            <span>Review finding outcome ID</span>
            <input value={findingOutcomeId} onChange={(event) => setFindingOutcomeId(event.target.value)} inputMode="numeric" />
          </label>
        </div>

        {reviewAction === "archive_response" ? (
          <label className={styles.confirmationRow}>
            <input
              type="checkbox"
              checked={explicitConfirmation}
              onChange={(event) => setExplicitConfirmation(event.target.checked)}
            />
            <span>I explicitly confirm archiving this response metadata if no notes are supplied.</span>
          </label>
        ) : null}

        <div className={styles.confirmationStack}>
          <label className={styles.confirmationRow}>
            <input
              type="checkbox"
              checked={confirmEvidenceOnly}
              onChange={(event) => setConfirmEvidenceOnly(event.target.checked)}
            />
            <span>I understand this response remains evidence/metadata only.</span>
          </label>
          <label className={styles.confirmationRow}>
            <input
              type="checkbox"
              checked={confirmNoCanonicalChange}
              onChange={(event) => setConfirmNoCanonicalChange(event.target.checked)}
            />
            <span>I understand this does not change canonical report facts.</span>
          </label>
          <label className={styles.confirmationRow}>
            <input
              type="checkbox"
              checked={confirmNoOutcomeClassification}
              onChange={(event) => setConfirmNoOutcomeClassification(event.target.checked)}
            />
            <span>I understand this does not classify corrected, removed, or unchanged outcomes.</span>
          </label>
        </div>

        {formError ? (
          <div className={styles.reviewError} role="alert">
            <AlertTriangle size={16} />
            <span>{formError}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className={styles.reviewSuccess} role="status">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <div className={styles.reviewActions}>
          <Button type="submit" disabled={adminReviewMutation.isPending}>
            <CheckCircle2 size={16} />
            Save Metadata Review
          </Button>
        </div>
      </form>
    </section>
  );
}

function ResponseCard({
  response,
  selected,
  onSelect,
}: {
  response: ResponseRecord;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <article className={`${styles.responseCard} ${selected ? styles.selectedResponse : ""}`}>
      <div className={styles.responseHeader}>
        <div>
          <span className={styles.kicker}>Response #{response.id}</span>
          <h2>{formatEnum(response.responseDocumentType)}</h2>
        </div>
        <div className={styles.badgeRow}>
          <Badge variant={channelVariant(response.responseChannel)}>{formatEnum(response.responseChannel)}</Badge>
          <Badge variant={statusVariant(response.responseStatus)}>{formatEnum(response.responseStatus)}</Badge>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Received" value={formatDate(response.responseReceivedAt)} />
        <DetailRow label="Created" value={formatDate(response.createdAt)} />
        <DetailRow label="Source" value={response.responseSource} fieldKey="responseSource" />
        <DetailRow label="Sender domain" value={response.responseSenderDomain} fieldKey="responseSenderDomain" />
        <DetailRow label="Subject" value={response.responseSubject} fieldKey="responseSubject" />
        <DetailRow label="Reference" value={response.responseReferenceId} fieldKey="responseReferenceId" />
        <DetailRow label="Packet" value={response.packetId} />
        <DetailRow label="Comparison run" value={response.comparisonRunId} />
        <DetailRow label="Finding outcome" value={response.findingOutcomeId} />
        <DetailRow label="Packet finding" value={response.disputePacketFindingId} />
        <DetailRow label="Evidence attachment" value={response.evidenceAttachmentId} />
      </div>

      <ProcessingSummary response={response} />

      <div className={styles.cardActions}>
        <Button variant="secondary" size="sm" onClick={() => onSelect(response.id)}>
          <Eye size={16} />
          View Details
        </Button>
      </div>
    </article>
  );
}

function ResponseDetailPanel({ response }: { response: ResponseDetail }) {
  return (
    <div className={styles.detailContent}>
      <div className={styles.detailHeader}>
        <div>
          <span className={styles.kicker}>Response #{response.id}</span>
          <h2>{formatEnum(response.responseDocumentType)}</h2>
        </div>
        <div className={styles.badgeRow}>
          <Badge variant={channelVariant(response.responseChannel)}>{formatEnum(response.responseChannel)}</Badge>
          <Badge variant={statusVariant(response.responseStatus)}>{formatEnum(response.responseStatus)}</Badge>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Channel" value={formatEnum(response.responseChannel)} />
        <DetailRow label="Document type" value={formatEnum(response.responseDocumentType)} />
        <DetailRow label="Status" value={formatEnum(response.responseStatus)} />
        <DetailRow label="Source" value={response.responseSource} fieldKey="responseSource" />
        <DetailRow label="Received" value={formatDate(response.responseReceivedAt)} />
        <DetailRow label="Created" value={formatDate(response.createdAt)} />
        <DetailRow label="Created by" value={response.createdBy} />
        <DetailRow label="Reviewed by" value={response.reviewedBy} />
        <DetailRow label="Reviewed at" value={formatDate(response.reviewedAt)} />
      </div>

      <div className={styles.detailGrid}>
        <DetailRow label="Packet" value={response.packetId} />
        <DetailRow label="Packet finding" value={response.disputePacketFindingId} />
        <DetailRow label="Comparison run" value={response.comparisonRunId} />
        <DetailRow label="Finding outcome" value={response.findingOutcomeId} />
        <DetailRow label="Bureau" value={response.bureauId} />
        <DetailRow label="Agency" value={response.agencyId} />
        <DetailRow label="Evidence attachment" value={response.evidenceAttachmentId} />
        <DetailRow label="Evidence event" value={response.attachmentEvidenceId} />
      </div>

      <div className={styles.metadataGrid}>
        <MetadataBlock label="Subject" value={response.responseSubject} fieldKey="responseSubject" />
        <MetadataBlock label="Sender domain" value={response.responseSenderDomain} fieldKey="responseSenderDomain" />
        <MetadataBlock label="Reference ID" value={response.responseReferenceId} fieldKey="responseReferenceId" />
        <MetadataBlock label="Response summary" value={response.responseSummary} fieldKey="responseSummary" />
        <MetadataBlock label="Review notes" value={response.reviewNotes} fieldKey="reviewNotes" />
        <MetadataBlock label="Normalized response hash" value={response.normalizedResponseHash} fieldKey="normalizedResponseHash" monospace />
      </div>

      <ResponseProcessingBlock response={response} />
      <EvidenceNotice />
      <ResponseAdminReviewControls response={response} />
    </div>
  );
}

export default function AdminResponseDocumentsPage() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedResponseId, setSelectedResponseId] = useState<number | null>(null);

  const listFilters = useMemo(() => filtersToInput(filters), [filters]);
  const responsesQuery = useResponseDocuments(listFilters);
  const detailQuery = useResponseDocument(selectedResponseId);

  const responses = responsesQuery.data?.responses ?? [];
  const selectedResponse = detailQuery.data?.response ?? null;
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => key !== "limit" && key !== "offset" && value.trim());

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value, ...(key !== "offset" ? { offset: "0" } : {}) }));
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Response Documents | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Response Documents"
        subtitle="Admin-only visibility into captured bureau and collection-agency response metadata."
      >
        <Button variant="secondary" onClick={() => responsesQuery.refetch()} disabled={responsesQuery.isFetching}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </PageHeader>

      <SafetyBanner />
      <MetricsStrip />
      <ResponseCapturePanel onCaptured={setSelectedResponseId} />

      <section className={styles.toolbar} aria-label="Response document filters">
        <div className={styles.toolbarHeader}>
          <Filter size={18} />
          <strong>Filters</strong>
        </div>
        <div className={styles.filters}>
          <label className={styles.filterField}>
            <span>Response channel</span>
            <select value={filters.responseChannel} onChange={(event) => updateFilter("responseChannel", event.target.value)}>
              <option value="">All channels</option>
              {BureauResponseChannelArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Document type</span>
            <select value={filters.responseDocumentType} onChange={(event) => updateFilter("responseDocumentType", event.target.value)}>
              <option value="">All document types</option>
              {BureauResponseDocumentTypeArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Status</span>
            <select value={filters.responseStatus} onChange={(event) => updateFilter("responseStatus", event.target.value)}>
              <option value="">All statuses</option>
              {BureauResponseStatusArrayValues.map((value) => (
                <option key={value} value={value}>{formatEnum(value)}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>Packet ID</span>
            <input value={filters.packetId} onChange={(event) => updateFilter("packetId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Packet finding ID</span>
            <input value={filters.disputePacketFindingId} onChange={(event) => updateFilter("disputePacketFindingId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Finding outcome ID</span>
            <input value={filters.findingOutcomeId} onChange={(event) => updateFilter("findingOutcomeId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Comparison run ID</span>
            <input value={filters.comparisonRunId} onChange={(event) => updateFilter("comparisonRunId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Bureau ID</span>
            <input value={filters.bureauId} onChange={(event) => updateFilter("bureauId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Agency ID</span>
            <input value={filters.agencyId} onChange={(event) => updateFilter("agencyId", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Start date</span>
            <input type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>End date</span>
            <input type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Limit</span>
            <input value={filters.limit} onChange={(event) => updateFilter("limit", event.target.value)} />
          </label>
          <label className={styles.filterField}>
            <span>Offset</span>
            <input value={filters.offset} onChange={(event) => updateFilter("offset", event.target.value)} />
          </label>
        </div>
        <div className={styles.filterActions}>
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear Filters
          </Button>
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.listPanel}>
          <div className={styles.sectionHeader}>
            <Search size={18} />
            <div>
              <h2>Captured Responses</h2>
              <p>{responsesQuery.data?.total ?? 0} response{responsesQuery.data?.total === 1 ? "" : "s"} found.</p>
            </div>
          </div>

          {responsesQuery.isLoading ? (
            <div className={styles.stack}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className={styles.responseSkeleton} />
              ))}
            </div>
          ) : responsesQuery.isError ? (
            <div className={styles.stateBox} role="alert">
              <AlertTriangle size={24} />
              <h3>Unable to load response documents</h3>
              <p>{responsesQuery.error instanceof Error ? responsesQuery.error.message : "Try refreshing the page."}</p>
            </div>
          ) : responses.length === 0 ? (
            <div className={styles.stateBox}>
              <Search size={24} />
              <h3>{hasActiveFilters ? "No matching response documents" : "No response documents yet"}</h3>
              <p>{hasActiveFilters ? "Adjust filters to broaden the result set." : "Captured response metadata will appear here after response records are created."}</p>
            </div>
          ) : (
            <div className={styles.stack}>
              {responses.map((response) => (
                <ResponseCard
                  key={response.id}
                  response={response}
                  selected={response.id === selectedResponseId}
                  onSelect={setSelectedResponseId}
                />
              ))}
            </div>
          )}
        </section>

        <section className={styles.detailPanel}>
          <div className={styles.sectionHeader}>
            <FileText size={18} />
            <div>
              <h2>Response Detail</h2>
              <p>Safe metadata view with deterministic intake results and isolated admin-only review controls.</p>
            </div>
          </div>

          {!selectedResponseId ? (
            <div className={styles.stateBox}>
              <Eye size={24} />
              <h3>Select a response document</h3>
              <p>Open a response to inspect safe metadata and links.</p>
            </div>
          ) : detailQuery.isLoading ? (
            <Skeleton className={styles.detailSkeleton} />
          ) : detailQuery.isError ? (
            <div className={styles.stateBox} role="alert">
              <AlertTriangle size={24} />
              <h3>Unable to load response document</h3>
              <p>{detailQuery.error instanceof Error ? detailQuery.error.message : "Try selecting the response again."}</p>
            </div>
          ) : selectedResponse ? (
            <ResponseDetailPanel response={selectedResponse} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
