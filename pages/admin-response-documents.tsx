import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import {
  AlertTriangle,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
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
  useResponseDocuments,
  type ResponseDocumentListInput,
} from "../helpers/responseDocumentQueries";
import type { OutputType as ResponseGetOutput } from "../endpoints/responses/get_GET.schema";
import type { OutputType as ResponseListOutput } from "../endpoints/responses/list_GET.schema";
import styles from "./admin-response-documents.module.css";

type ResponseRecord = ResponseListOutput["responses"][number];
type ResponseDetail = ResponseGetOutput["response"];

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

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|raw.?text|raw.?extracted|extracted.?text|pdf.?text|report.?text|email.?body|full.?email|packet.?body|storage.?url|signed.?url|token|api.?key|private.?key|database.?url|cookie|session|mailbox.?credential|email.?auth)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{9,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{10,}\b/g;
const RAW_OR_SECRET_PATTERN =
  /(raw report text|raw pdf text|full email body|email body dump|packet body|bucket:\/\/|s3:\/\/|storage\.googleapis\.com|x-goog-signature|x-amz-signature|signedurl|signed_url|storageurl|storage_url|session=|cookie=|api[_-]?key|private key|database_url|postgres:\/\/|mailbox password|imap password|smtp password|email auth token|oauth refresh token)/i;
const LEGAL_CONCLUSION_PATTERN =
  /\b(equifax admitted fault|the bureau corrected the item|the bureau violated the law|you won|you are entitled to damages|this proves correction|this is legal proof|the agency must pay|confirmed legal violation|legal violation|demand|enforce)\b/i;
const HASH_KEY_PATTERN = /hash/i;
const HASH_VALUE_PATTERN = /^[a-f0-9]{32,128}$/i;

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
        <strong>Response documents are evidence and metadata only.</strong>
        <span>A later credit report comparison is still required to classify corrected, removed, or unchanged outcomes.</span>
        <span>This page does not parse response documents.</span>
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
        Response captured. Later credit-report comparison is required before corrected/removed/unchanged outcomes can be classified.
      </span>
    </div>
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

      <EvidenceNotice />
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
              <p>Read-only metadata view. No response parsing, review action, or source-truth change happens here.</p>
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
