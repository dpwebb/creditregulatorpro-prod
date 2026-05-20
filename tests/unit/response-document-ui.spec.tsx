import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useResponseDocuments: vi.fn(),
  useResponseDocument: vi.fn(),
  useResponseProcessingMetrics: vi.fn(),
  useResponseProcessingQueue: vi.fn(),
  useResponseDocumentAdminReviewMutation: vi.fn(),
  useResponseCaptureMutation: vi.fn(),
  useResponseQueueRemediationMutation: vi.fn(),
  useAdminIngestProcessingQueue: vi.fn(),
  adminReviewMutateAsync: vi.fn(),
  responseCaptureMutateAsync: vi.fn(),
  queueRemediationMutateAsync: vi.fn(),
  useAdminUsers: vi.fn(),
  useAdminUserDetail: vi.fn(),
  refetchResponses: vi.fn(),
  listResponse: null as any,
  detailResponse: null as any,
}));

vi.mock("../../helpers/responseDocumentQueries", () => ({
  useResponseDocuments: mocks.useResponseDocuments,
  useResponseDocument: mocks.useResponseDocument,
  useResponseProcessingMetrics: mocks.useResponseProcessingMetrics,
  useResponseProcessingQueue: mocks.useResponseProcessingQueue,
  useResponseDocumentAdminReviewMutation: mocks.useResponseDocumentAdminReviewMutation,
  useResponseCaptureMutation: mocks.useResponseCaptureMutation,
  useResponseQueueRemediationMutation: mocks.useResponseQueueRemediationMutation,
}));

vi.mock("../../helpers/ingestQueueQueries", () => ({
  useAdminIngestProcessingQueue: mocks.useAdminIngestProcessingQueue,
}));

vi.mock("../../helpers/adminQueries", () => ({
  useAdminUsers: mocks.useAdminUsers,
  useAdminUserDetail: mocks.useAdminUserDetail,
}));

import { AdminRoute } from "../../components/ProtectedRoute";
import AdminResponseDocumentsPage from "../../pages/admin-response-documents";
import pageLayout from "../../pages/admin-response-documents.pageLayout";

const responseRecord = {
  id: 901,
  userId: 11,
  packetId: 21,
  disputePacketFindingId: 22,
  findingOutcomeId: 23,
  comparisonRunId: 24,
  bureauId: 25,
  agencyId: null,
  responseChannel: "email",
  responseDocumentType: "bureau_email_response",
  responseReceivedAt: "2026-05-18T12:00:00.000Z",
  responseSource: "manual_record",
  responseSubject: "OUTCOME_SMOKE_SAFE_SUBJECT",
  responseSenderDomain: "example.test",
  responseReferenceId: "OUTCOME_SMOKE_REF",
  attachmentEvidenceId: 26,
  evidenceAttachmentId: 27,
  normalizedResponseHash: "a".repeat(64),
  responseSummary: "Synthetic response recorded as evidence metadata.",
  responseStatus: "linked_to_outcome",
  rawArtifactMetadata: { fileSha256: "a".repeat(64) },
  normalizedResponseMetadata: { senderType: "bureau" },
  latestProcessingEventId: 1001,
  latestProcessingStatus: "manual_review",
  latestClassification: "remains",
  latestClassificationConfidence: 0.83,
  latestExtractionSource: "deterministic",
  latestRequiresManualReview: true,
  latestProcessingCreatedAt: "2026-05-18T12:02:00.000Z",
  latestProcessingEvent: {
    id: 1001,
    responseEventId: 901,
    userId: 11,
    packetId: 21,
    disputePacketFindingId: 22,
    findingOutcomeId: 23,
    comparisonRunId: 24,
    bureauId: 25,
    agencyId: null,
    tradelineId: 28,
    violationId: 29,
    processingKind: "deterministic_response_classification",
    processingStatus: "manual_review",
    extractionSource: "deterministic",
    classifierRuleId: "response-document-classifier-v1",
    parserVersion: "response-document-parser-2026-05-19",
    classification: "remains",
    classificationConfidence: 0.83,
    confidenceThreshold: 0.8,
    requiresManualReview: true,
    uncertaintyCodes: ["ADVERSE_RESPONSE_REQUIRES_REVIEW"],
    rawArtifactMetadata: { fileSha256: "a".repeat(64) },
    normalizedResponseMetadata: { senderType: "bureau" },
    deterministicExtraction: { linkedPacketId: 21, linkedViolationId: 29, linkedTradelineId: 28 },
    fieldProvenance: [{ field: "classification", sourceField: "responseSummary", evidenceType: "response_summary", confidence: 0.83 }],
    rationale: [{ code: "response-remains", message: "Response states the item remains verified or unchanged.", confidence: 0.83 }],
    regulationReferences: [],
    readinessImpact: { readinessGateMutated: false, readinessRegression: false, notes: "Response intake is recorded for review only." },
    violationImpact: { violationTruthMutated: false, linkedViolationId: 29, notes: "Response classification does not rewrite violation truth." },
    idempotencyKey: "synthetic",
    normalizedResponseHash: "a".repeat(64),
    originalEvidenceHash: "a".repeat(64),
    fallbackRequested: false,
    fallbackAllowed: false,
    fallbackReason: "AI fallback disabled",
    deadLetterReason: null,
    createdAt: "2026-05-18T12:02:00.000Z",
    createdBy: 11,
  },
  createdBy: 11,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: "2026-05-18T12:01:00.000Z",
  updatedAt: "2026-05-18T12:01:00.000Z",
};

const unsafeDetailResponse = {
  ...responseRecord,
  responseSubject: "Account number 1234567890123456 raw report text SHOULD_NOT_RENDER_RAW_REPORT_TEXT",
  responseReferenceId: "ref-1234567890123456",
  responseSummary:
    "full email body packet body raw pdf text s3://secret/path?x-goog-signature=secret database_url=postgres://secret",
  reviewNotes: "The bureau violated the law and this proves correction.",
};

function resetHookMocks() {
  mocks.listResponse = responseRecord;
  mocks.detailResponse = responseRecord;
  mocks.refetchResponses.mockResolvedValue(undefined);
  mocks.useResponseDocuments.mockImplementation((filters: unknown) => ({
    data: { responses: mocks.listResponse ? [mocks.listResponse] : [], total: mocks.listResponse ? 1 : 0 },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mocks.refetchResponses,
    filters,
  }));
  mocks.useResponseDocument.mockImplementation((responseId: number | null) => ({
    data: responseId ? { response: mocks.detailResponse } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }));
  mocks.useResponseProcessingMetrics.mockReturnValue({
    data: {
      metrics: {
        lookbackHours: 24,
        generatedAt: "2026-05-18T12:03:00.000Z",
        totals: {
          processed: 1,
          completed: 0,
          manualReview: 1,
          unknownManualReview: 0,
          suspicious: 0,
          deadLetters: 0,
          failed: 0,
          fallbackRequested: 0,
          fallbackAllowed: 0,
          ocrFallback: 0,
          readinessRegression: 0,
          repeatedParserMismatch: 0,
          workflowStalls: 0,
        },
        classificationCounts: [{ classification: "remains", count: 1 }],
        alerts: [],
        replayReadiness: {
          generatedAt: "2026-05-18T12:03:00.000Z",
          totalResponseRecords: 1,
          replayableRecords: 1,
          nonReplayableRecords: 0,
          nonReplayableReasonCounts: [],
          staleOrMissingClassifierMetadata: 0,
          missingProcessingSummary: 0,
          manualReviewRequired: 1,
          uncertainty: 1,
          duplicateAttemptAudits: 0,
          lastReplayDryRunAt: null,
          lastReplayApplyAt: null,
          boundaries: {
            noRawResponseText: true,
            dryRunDoesNotPersist: true,
            applyIsAppendOnly: true,
            liveMailboxIntegrationUsed: false,
          },
        },
        queueHealth: {
          generatedAt: "2026-05-18T12:03:00.000Z",
          queueVersion: "response-processing-queue-2026-05-19",
          totalJobs: 0,
          queuedJobs: 0,
          runningJobs: 0,
          succeededJobs: 0,
          failedJobs: 0,
          deadLetteredJobs: 0,
          staleRunningJobs: 0,
          retryBacklogJobs: 0,
          oldestQueuedAgeSeconds: null,
          duplicateEnqueueAttempts: 0,
          deadLetterAcknowledgedJobs: 0,
          staleRunningReviewedJobs: 0,
          replacementJobs: 0,
          replayFailureJobs: 0,
          remediationFailureJobs: 0,
          lastRemediationStatus: null,
          lastRemediationAt: null,
          recentWorkerRunStatus: null,
          recentWorkerRunAt: null,
          boundaries: {
            durableDbBacked: true,
            appendOnlyJobEvents: true,
            noRawResponseText: true,
            noSecretsInPayload: true,
            liveMailboxIntegrationUsed: false,
            externalAlertDeliveryUsed: false,
            canonicalFactsMutated: false,
            violationTruthMutated: false,
            packetReadinessMutated: false,
          },
        },
        workerOrchestration: {
          generatedAt: "2026-05-18T12:03:00.000Z",
          orchestrationVersion: "response-worker-orchestration-2026-05-19",
          totalRuns: 0,
          runningRuns: 0,
          staleRunningRuns: 0,
          succeededRuns: 0,
          failedRuns: 0,
          skippedRuns: 0,
          skippedOverlapRuns: 0,
          recentFailedRuns: 0,
          lastRunStatus: null,
          lastRunAt: null,
          lastSuccessfulRunAt: null,
          lastFailedRunAt: null,
          activeLock: null,
          boundaries: {
            bounded: true,
            noDaemon: true,
            overlapPreventionEnabled: true,
            noRawResponseText: true,
            externalAlertDeliveryUsed: false,
            liveMailboxIntegrationUsed: false,
          },
        },
        lifecycle: {
          generatedAt: "2026-05-18T12:03:00.000Z",
          lifecycleVersion: "response-processing-lifecycle-2026-05-19",
          cleanupEligibleRecords: 0,
          cleanupMarkedRecords: 0,
          activeDriftAlerts: 0,
          criticalDriftAlerts: 0,
          lastCleanupAt: null,
          lastDriftReportAt: null,
          lastSoakCheckAt: "2026-05-18T12:02:00.000Z",
          lastSoakCheckStatus: "succeeded",
          retentionPreview: {
            generatedAt: "2026-05-18T12:03:00.000Z",
            lifecycleVersion: "response-processing-lifecycle-2026-05-19",
            dryRun: true,
            olderThanDays: 90,
            limit: 100,
            source: null,
            queueJobs: {
              eligibleRecords: 0,
              previewedRecordIds: [],
              blockedActiveRecords: 0,
              blockedStaleRecords: 0,
              blockedFailedRecords: 0,
              blockedDeadLetterRecords: 0,
              eventRowsCovered: 0,
              destructiveDeleteUsed: false,
            },
            orchestrationRuns: {
              eligibleRecords: 0,
              previewedRecordIds: [],
              blockedActiveRecords: 0,
              blockedStaleRecords: 0,
              blockedFailedRecords: 0,
              blockedDeadLetterRecords: 0,
              eventRowsCovered: 0,
              destructiveDeleteUsed: false,
            },
            replayAuditHistory: {
              recordsOlderThanRetention: 0,
              eligibleRecords: 0,
              reason: "append_only_replay_audit_retained",
            },
            internalAlertHistory: {
              recordsOlderThanRetention: 0,
              eligibleRecords: 0,
              reason: "append_only_internal_alert_history_retained",
            },
            cleanupAlreadyMarkedRecords: 0,
            oldestTerminalJobAgeSeconds: null,
            oldestDeadLetterAgeSeconds: null,
            oldestTerminalOrchestrationAgeSeconds: null,
            boundaries: {
              noDestructiveCleanupByDefault: true,
              explicitOperatorControlRequired: true,
              activeJobsProtected: true,
              runningJobsProtected: true,
              staleJobsProtected: true,
              deadLetterJobsProtected: true,
              appendOnlyLifecycleEvents: true,
              rawResponseTextStored: false,
              canonicalFactsMutated: false,
              violationTruthMutated: false,
              packetReadinessMutated: false,
            },
          },
          driftReport: {
            generatedAt: "2026-05-18T12:03:00.000Z",
            lifecycleVersion: "response-processing-lifecycle-2026-05-19",
            source: null,
            lookbackHours: 24,
            checks: [],
            activeChecks: 0,
            criticalChecks: 0,
            thresholds: {
              queueGrowthDelta: 100,
              deadLetterGrowthDelta: 1,
              retryBacklogJobs: 5,
              staleRunningJobs: 1,
              replayNonReplayableRecords: 25,
              orchestrationOverlapSkips: 3,
              repeatedWorkerFailures: 2,
              orphanedReplacementChains: 1,
              orphanedRemediationReferences: 1,
              oldestQueuedAgeSeconds: 3600,
              oldestDeadLetterAgeSeconds: 604800,
            },
            trendWindow: {
              currentQueuedJobsCreated: 0,
              previousQueuedJobsCreated: 0,
              currentDeadLetteredJobs: 0,
              previousDeadLetteredJobs: 0,
            },
            boundaries: {
              operatorVisibleOnly: true,
              noExternalAlerts: true,
              noAutoRemediation: true,
              noRawResponseText: true,
              liveMailboxIntegrationUsed: false,
            },
          },
          boundaries: {
            appendOnlyLifecycleEvents: true,
            destructiveDeleteUsed: false,
            noRawResponseText: true,
            externalAlertDeliveryUsed: false,
            liveMailboxIntegrationUsed: false,
          },
        },
        boundaries: {
          redacted: true,
          structuredOnly: true,
          noRawResponseText: true,
          noCanonicalMutation: true,
          noPacketReadinessMutation: true,
        },
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });
  mocks.useResponseProcessingQueue.mockReturnValue({
    data: {
      jobs: [
        {
          id: 701,
          jobType: "future_mailbox_intake",
          status: "dead_lettered",
          idempotencyKey: "synthetic-queue-job",
          actorUserId: 41,
          source: "synthetic_queue",
          runAfter: "2026-05-18T12:00:00.000Z",
          startedAt: "2026-05-18T12:01:00.000Z",
          finishedAt: "2026-05-18T12:02:00.000Z",
          createdAt: "2026-05-18T12:00:00.000Z",
          updatedAt: "2026-05-18T12:02:00.000Z",
          attemptCount: 1,
          maxAttempts: 1,
          lockedBy: null,
          lockedAt: null,
          lockedUntil: null,
          lastErrorCode: "LIVE_MAILBOX_INTEGRATION_DEFERRED",
          lastErrorReason: "future_mailbox_intake is an inert placeholder until live mailbox integration is explicitly implemented.",
          payloadSummary: {
            responseId: null,
            sourceType: "future_mailbox",
            filterKeys: [],
            classification: null,
            manualReviewRequired: null,
            metadataKeys: [],
            messageReferenceHashPresent: true,
            sourceMessageHashPresent: false,
            confirmApply: false,
            dryRunOnly: false,
            rawResponseTextStored: false,
            liveMailboxIntegrationUsed: false,
          },
          resultSummary: {},
          staleRunning: false,
          retryEligible: true,
          acknowledgeEligible: true,
          staleReviewEligible: false,
          remediationStatus: {
            deadLetterAcknowledgedAt: null,
            staleRunningReviewedAt: null,
            replacementJobId: null,
          },
          lastEvent: {
            id: 801,
            jobId: 701,
            eventType: "dead_lettered",
            previousStatus: "running",
            nextStatus: "dead_lettered",
            attemptCount: 1,
            workerId: "synthetic-worker",
            actorUserId: 41,
            details: { rawResponseTextLogged: false },
            errorCode: "LIVE_MAILBOX_INTEGRATION_DEFERRED",
            errorReason: "future mailbox deferred",
            createdAt: "2026-05-18T12:02:00.000Z",
          },
        },
        {
          id: 702,
          jobType: "future_mailbox_intake",
          status: "dead_lettered",
          idempotencyKey: "synthetic-replaced-job",
          actorUserId: 41,
          source: "synthetic_queue",
          runAfter: "2026-05-18T12:00:00.000Z",
          startedAt: "2026-05-18T12:01:00.000Z",
          finishedAt: "2026-05-18T12:02:00.000Z",
          createdAt: "2026-05-18T12:00:00.000Z",
          updatedAt: "2026-05-18T12:02:00.000Z",
          attemptCount: 1,
          maxAttempts: 1,
          lockedBy: null,
          lockedAt: null,
          lockedUntil: null,
          lastErrorCode: "LIVE_MAILBOX_INTEGRATION_DEFERRED",
          lastErrorReason: "future mailbox deferred",
          payloadSummary: {
            responseId: null,
            sourceType: "future_mailbox",
            filterKeys: [],
            classification: null,
            manualReviewRequired: null,
            metadataKeys: [],
            messageReferenceHashPresent: true,
            sourceMessageHashPresent: false,
            confirmApply: false,
            dryRunOnly: false,
            rawResponseTextStored: false,
            liveMailboxIntegrationUsed: false,
          },
          resultSummary: {},
          staleRunning: false,
          retryEligible: false,
          acknowledgeEligible: false,
          staleReviewEligible: false,
          remediationStatus: {
            deadLetterAcknowledgedAt: null,
            staleRunningReviewedAt: null,
            replacementJobId: 704,
          },
          lastEvent: {
            id: 803,
            jobId: 702,
            eventType: "replacement_enqueued",
            previousStatus: "dead_lettered",
            nextStatus: "dead_lettered",
            attemptCount: 1,
            workerId: null,
            actorUserId: 41,
            details: { replacementJobId: 704, rawResponseTextLogged: false },
            errorCode: null,
            errorReason: null,
            createdAt: "2026-05-18T12:03:00.000Z",
          },
        },
        {
          id: 703,
          jobType: "response_replay_dry_run",
          status: "running",
          idempotencyKey: "synthetic-stale-job",
          actorUserId: null,
          source: "synthetic_queue",
          runAfter: "2026-05-18T12:00:00.000Z",
          startedAt: "2026-05-18T12:01:00.000Z",
          finishedAt: null,
          createdAt: "2026-05-18T12:00:00.000Z",
          updatedAt: "2026-05-18T12:01:00.000Z",
          attemptCount: 1,
          maxAttempts: 3,
          lockedBy: "synthetic-worker",
          lockedAt: "2026-05-18T12:01:00.000Z",
          lockedUntil: "2026-05-18T11:59:00.000Z",
          lastErrorCode: null,
          lastErrorReason: null,
          payloadSummary: {
            responseId: 901,
            sourceType: null,
            filterKeys: ["responseId"],
            classification: null,
            manualReviewRequired: null,
            metadataKeys: [],
            messageReferenceHashPresent: false,
            sourceMessageHashPresent: false,
            confirmApply: false,
            dryRunOnly: true,
            rawResponseTextStored: false,
            liveMailboxIntegrationUsed: false,
          },
          resultSummary: {},
          staleRunning: true,
          retryEligible: false,
          acknowledgeEligible: false,
          staleReviewEligible: true,
          remediationStatus: {
            deadLetterAcknowledgedAt: null,
            staleRunningReviewedAt: null,
            replacementJobId: null,
          },
          lastEvent: {
            id: 802,
            jobId: 703,
            eventType: "claimed",
            previousStatus: "queued",
            nextStatus: "running",
            attemptCount: 1,
            workerId: "synthetic-worker",
            actorUserId: null,
            details: { staleReclaim: false },
            errorCode: null,
            errorReason: null,
            createdAt: "2026-05-18T12:01:00.000Z",
          },
        },
      ],
      total: 3,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
  });
  mocks.queueRemediationMutateAsync.mockResolvedValue({
    remediation: {
      status: "dead_letter_acknowledged",
      job: null,
      replacementJob: null,
    },
  });
  mocks.useResponseQueueRemediationMutation.mockReturnValue({
    mutateAsync: mocks.queueRemediationMutateAsync,
    isPending: false,
    error: null,
  });
  mocks.useAdminIngestProcessingQueue.mockReturnValue({
    data: {
      total: 2,
      jobs: [
        {
          id: 811,
          jobType: "report_ingest",
          status: "dead_lettered",
          attemptCount: 3,
          maxAttempts: 3,
          staleRunning: false,
          retryEligible: true,
          reviewEligible: true,
          cancelEligible: false,
          payloadSummary: {
            reportArtifactId: 301,
            region: "CA",
            mimeType: "application/pdf",
            artifactSha256Present: true,
            metadataKeys: ["source"],
            rawReportBytesStored: false,
            extractedReportTextStored: false,
          },
          lastErrorCode: "SYNTHETIC_INGEST_FAILURE",
          lastErrorReason: "Synthetic sanitized ingest failure.",
          lastEvent: {
            eventType: "dead_lettered",
            createdAt: "2026-05-18T12:03:00.000Z",
          },
          remediationStatus: {
            deadLetterReviewedAt: null,
            staleRunningReviewedAt: null,
            canceledAt: null,
            replacementJobId: null,
          },
        },
        {
          id: 812,
          jobType: "report_ingest",
          status: "running",
          attemptCount: 1,
          maxAttempts: 3,
          staleRunning: true,
          retryEligible: false,
          reviewEligible: true,
          cancelEligible: false,
          payloadSummary: {
            reportArtifactId: 302,
            region: "CA",
            mimeType: "application/pdf",
            artifactSha256Present: true,
            metadataKeys: [],
            rawReportBytesStored: false,
            extractedReportTextStored: false,
          },
          lastErrorCode: null,
          lastErrorReason: null,
          lastEvent: {
            eventType: "claimed",
            createdAt: "2026-05-18T12:04:00.000Z",
          },
          remediationStatus: {
            deadLetterReviewedAt: null,
            staleRunningReviewedAt: null,
            canceledAt: null,
            replacementJobId: null,
          },
        },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  });
  mocks.adminReviewMutateAsync.mockResolvedValue({ response: mocks.detailResponse });
  mocks.useResponseDocumentAdminReviewMutation.mockReturnValue({
    mutateAsync: mocks.adminReviewMutateAsync,
    isPending: false,
    error: null,
  });
  mocks.responseCaptureMutateAsync.mockResolvedValue({
    response: responseRecord,
    intake: {
      status: "captured",
      sourceType: "manual_admin",
      duplicateOfResponseId: null,
      idempotencyKey: "capture-idempotency",
      responseTextHash: "b".repeat(64),
      responseTextStored: false,
    },
  });
  mocks.useResponseCaptureMutation.mockReturnValue({
    mutateAsync: mocks.responseCaptureMutateAsync,
    isPending: false,
    error: null,
  });
  mocks.useAdminUsers.mockReturnValue({
    data: {
      users: [
        {
          id: 11,
          email: "consumer@example.test",
          displayName: "Synthetic Consumer",
          fullName: null,
          role: "user",
          createdAt: "2026-05-18T12:00:00.000Z",
          emailVerified: true,
          avatarUrl: null,
          tradelinesCount: 1,
          packetsCount: 1,
          evidenceEventsCount: 0,
          subscriptionPlan: null,
          subscriptionStatus: null,
          reportArtifactsCount: 1,
        },
      ],
      total: 1,
    },
    isLoading: false,
    isError: false,
    error: null,
  });
  mocks.useAdminUserDetail.mockReturnValue({
    data: {
      user: {
        id: 11,
        email: "consumer@example.test",
        displayName: "Synthetic Consumer",
        role: "user",
        emailVerified: true,
        avatarUrl: null,
        createdAt: "2026-05-18T12:00:00.000Z",
      },
      subscription: null,
      tradelines: [],
      packets: [
        {
          id: 21,
          status: "draft",
          type: "bureau_dispute",
          createdAt: "2026-05-18T12:00:00.000Z",
          tradelineAccountNumber: null,
          creditorName: "Synthetic Creditor",
          originalCreditorName: null,
          terminalLabel: "response test packet",
          deliveryMethod: "mail",
          violationCategory: "RESPONSE_INCOMPLETE",
          obligationType: "DISPUTE_INVESTIGATION",
        },
      ],
      reportArtifacts: [],
      recentActivity: [],
    },
    isLoading: false,
    isError: false,
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookMocks();
});

async function openResponseDetail() {
  render(<AdminResponseDocumentsPage />);
  fireEvent.click(screen.getByRole("button", { name: /view details/i }));
  await screen.findByText(/Admin Metadata Review/i);
}

function checkRequiredConfirmations() {
  fireEvent.click(screen.getByLabelText(/response remains evidence\/metadata only/i));
  fireEvent.click(screen.getByLabelText(/does not change canonical report facts/i));
  fireEvent.click(screen.getByLabelText(/does not classify corrected, removed, or unchanged outcomes/i));
}

describe("admin response document UI", () => {
  it("uses the admin route layout and renders the Response Documents page", () => {
    expect(pageLayout[0]).toBe(AdminRoute);

    render(<AdminResponseDocumentsPage />);

    expect(screen.getByRole("heading", { name: "Response Documents" })).toBeInTheDocument();
    expect(screen.getByText(/immutable evidence plus append-only deterministic processing/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic response parsing runs without AI dependency/i)).toBeInTheDocument();
    expect(screen.getByText(/No mailbox, Gmail, IMAP, or inbox integration is used/i)).toBeInTheDocument();
    expect(screen.getByText("Processed 24h")).toBeInTheDocument();
    expect(screen.getByText("OCR Fallback")).toBeInTheDocument();
    expect(screen.getByText("Readiness Regression")).toBeInTheDocument();
    expect(screen.getByText("Replayable")).toBeInTheDocument();
    expect(screen.getByText("Non-Replayable")).toBeInTheDocument();
    expect(screen.getByText("Replay Stale")).toBeInTheDocument();
    expect(screen.getByText("Queue Queued")).toBeInTheDocument();
    expect(screen.getByText("Queue Failed")).toBeInTheDocument();
    expect(screen.getByText("Queue Dead")).toBeInTheDocument();
    expect(screen.getByText("Queue Stale")).toBeInTheDocument();
    expect(screen.getByText("Retry Backlog")).toBeInTheDocument();
    expect(screen.getByText("Worker Failures")).toBeInTheDocument();
    expect(screen.getByText("Skipped Runs")).toBeInTheDocument();
    expect(screen.getByText("Last Worker")).toBeInTheDocument();
    expect(screen.getByText("Cleanup Eligible")).toBeInTheDocument();
    expect(screen.getByText("Drift Alerts")).toBeInTheDocument();
    expect(screen.getByText("Oldest Dead")).toBeInTheDocument();
    expect(screen.getByText("Last Soak")).toBeInTheDocument();
    expect(screen.getByText("DL Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Stale Reviewed")).toBeInTheDocument();
    expect(screen.getByText("Limited beta only under strict constraints")).toBeInTheDocument();
    expect(screen.getByText(/Not broad-production ready\. Not production-at-scale ready\./i)).toBeInTheDocument();
    expect(screen.getByText(/policy gate, not a runtime throttle/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ingest Queue Visibility" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /ingest queue visibility/i })).toHaveTextContent("dead lettered");
    expect(screen.getByRole("region", { name: /ingest queue visibility/i })).toHaveTextContent("running");
    expect(screen.getByRole("region", { name: /ingest queue visibility/i })).toHaveTextContent("Report artifact 301");
    expect(screen.getByRole("region", { name: /ingest queue visibility/i })).toHaveTextContent("Raw bytes stored: no");
    expect(screen.getByRole("region", { name: /ingest queue visibility/i })).toHaveTextContent("Extracted text stored: no");
    expect(screen.getByRole("heading", { name: "Queue Remediation" })).toBeInTheDocument();
    expect(screen.getByText(/Live mailbox scheduling remains deferred/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manual Response Capture" })).toBeInTheDocument();
    expect(screen.getByText(/Live mailbox connections remain disabled/i)).toBeInTheDocument();
  });

  it("renders admin manual capture controls without live mailbox controls", () => {
    render(<AdminResponseDocumentsPage />);

    expect(screen.getByLabelText("Search consumer")).toBeInTheDocument();
    expect(screen.getByLabelText("Consumer")).toBeInTheDocument();
    expect(screen.getByLabelText("Existing packet")).toBeInTheDocument();
    expect(screen.getByLabelText("Intake source")).toBeInTheDocument();
    expect(screen.getByLabelText("Response text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit response intake/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect gmail/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect imap/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inbox sync/i })).not.toBeInTheDocument();
  });

  it("renders queue remediation states and submits explicit operator actions", async () => {
    render(<AdminResponseDocumentsPage />);

    expect(screen.getAllByText("Job").length).toBeGreaterThan(0);
    expect(screen.getByText("#701")).toBeInTheDocument();
    expect(screen.getByText("#702")).toBeInTheDocument();
    expect(screen.getByText("#703")).toBeInTheDocument();
    expect(screen.getByText("Replacement #704")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /confirm retry/i })).toHaveLength(1);
    expect(screen.getAllByText(/future mailbox intake/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stale running/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Dead-letter retries create a replacement job/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("raw response text");
    expect(document.body).not.toHaveTextContent("database_url");

    fireEvent.click(screen.getByRole("button", { name: /confirm retry/i }));
    await waitFor(() => {
      expect(mocks.queueRemediationMutateAsync).toHaveBeenCalledWith({
        jobId: 701,
        action: "retry_job",
        confirmRetry: true,
        confirmReview: undefined,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
    await waitFor(() => {
      expect(mocks.queueRemediationMutateAsync).toHaveBeenCalledWith({
        jobId: 701,
        action: "acknowledge_dead_letter",
        confirmRetry: undefined,
        confirmReview: true,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));
    await waitFor(() => {
      expect(mocks.queueRemediationMutateAsync).toHaveBeenCalledWith({
        jobId: 703,
        action: "mark_stale_reviewed",
        confirmRetry: undefined,
        confirmReview: true,
      });
    });
  });

  it("surfaces internal operator alerts without external delivery or unsafe payloads", () => {
    const baseMetrics = mocks.useResponseProcessingMetrics().data.metrics;
    mocks.useResponseProcessingMetrics.mockReturnValue({
      data: {
        metrics: {
          ...baseMetrics,
          alerts: [
            {
              key: "queue_dead_letter_backlog",
              severity: "critical",
              active: true,
              count: 2,
              threshold: 1,
              message: "Response-processing queue has dead-lettered jobs requiring operator remediation.",
              remediationTarget: "queue_remediation",
            },
            {
              key: "repeated_worker_failures",
              severity: "critical",
              active: true,
              count: 2,
              threshold: 2,
              message: "Bounded response worker orchestration failed repeatedly in the last 24 hours.",
              remediationTarget: "worker_orchestration",
            },
          ],
          queueHealth: {
            ...baseMetrics.queueHealth,
            deadLetteredJobs: 2,
          },
          workerOrchestration: {
            ...baseMetrics.workerOrchestration,
            recentFailedRuns: 2,
            lastRunStatus: "failed",
          },
        },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    render(<AdminResponseDocumentsPage />);

    expect(screen.getByRole("heading", { name: "Internal Operator Alerts" })).toBeInTheDocument();
    expect(screen.getByText("queue dead letter backlog")).toBeInTheDocument();
    expect(screen.getByText("repeated worker failures")).toBeInTheDocument();
    expect(screen.getByText(/No email, Slack, webhook, mailbox, or external delivery is active/i)).toBeInTheDocument();
    expect(screen.getByText(/Alerts are deterministic and do not trigger auto-remediation/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("raw response text");
    expect(document.body).not.toHaveTextContent("database_url");
    expect(document.body).not.toHaveTextContent("connect gmail");
  });

  it("submits manual admin response intake and shows deterministic classification results", async () => {
    render(<AdminResponseDocumentsPage />);

    fireEvent.change(screen.getByLabelText("Consumer"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Existing packet"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Capture document type"), { target: { value: "bureau_email_response" } });
    fireEvent.change(screen.getByLabelText("Capture response channel"), { target: { value: "email" } });
    fireEvent.change(screen.getByLabelText("Response date"), { target: { value: "2026-05-18" } });
    fireEvent.change(screen.getByLabelText("Response text"), {
      target: { value: "We verified as accurate and the item remains unchanged." },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit response intake/i }));

    await waitFor(() => {
      expect(mocks.responseCaptureMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          intakeSourceType: "manual_admin",
          userId: 11,
          packetId: 21,
          responseText: "We verified as accurate and the item remains unchanged.",
          responseStatus: "received",
          normalizedResponseMetadata: expect.objectContaining({
            senderType: "bureau",
          }),
          sourceMetadata: expect.objectContaining({
            liveMailboxIntegrationUsed: false,
          }),
        }),
      );
    });
    expect(await screen.findByText("Response captured")).toBeInTheDocument();
    expect(screen.getByText("Manual review is required before this response can influence any downstream outcome.")).toBeInTheDocument();
    expect(screen.getAllByText("83% confidence").length).toBeGreaterThan(0);
  });

  it("shows duplicate intake status returned by idempotent capture", async () => {
    mocks.responseCaptureMutateAsync.mockResolvedValueOnce({
      response: responseRecord,
      intake: {
        status: "duplicate",
        sourceType: "manual_admin",
        duplicateOfResponseId: 901,
        idempotencyKey: "capture-idempotency",
        responseTextHash: "b".repeat(64),
        responseTextStored: false,
      },
    });
    render(<AdminResponseDocumentsPage />);

    fireEvent.change(screen.getByLabelText("Consumer"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Response text"), {
      target: { value: "We verified as accurate and the item remains unchanged." },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit response intake/i }));

    expect(await screen.findByText("Duplicate intake matched existing response")).toBeInTheDocument();
  });

  it("rejects malformed capture form input before calling the capture endpoint", async () => {
    render(<AdminResponseDocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /submit response intake/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Select a consumer");
    expect(mocks.responseCaptureMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Consumer"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Response text"), {
      target: { value: "Full SIN 123-456-789" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit response intake/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("full SIN-like values");
    expect(mocks.responseCaptureMutateAsync).not.toHaveBeenCalled();
  });

  it("renders loading, empty, and error list states", () => {
    mocks.useResponseDocuments.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: mocks.refetchResponses,
    });
    const loadingRender = render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("Captured Responses")).toBeInTheDocument();
    loadingRender.unmount();

    mocks.useResponseDocuments.mockReturnValueOnce({
      data: { responses: [], total: 0 },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mocks.refetchResponses,
    });
    const emptyRender = render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("No response documents yet")).toBeInTheDocument();
    emptyRender.unmount();

    mocks.useResponseDocuments.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("Synthetic response list failure"),
      refetch: mocks.refetchResponses,
    });
    render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("Unable to load response documents")).toBeInTheDocument();
    expect(screen.getByText("Synthetic response list failure")).toBeInTheDocument();
  });

  it("renders responses and sends supported filters to the response list hook", async () => {
    render(<AdminResponseDocumentsPage />);

    expect(screen.getByText("Response #901")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Response channel"), { target: { value: "email" } });
    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "bureau_email_response" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "linked_to_outcome" } });
    fireEvent.change(screen.getByLabelText("Packet ID"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Packet finding ID"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Finding outcome ID"), { target: { value: "23" } });
    fireEvent.change(screen.getByLabelText("Comparison run ID"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Offset"), { target: { value: "5" } });

    await waitFor(() => {
      expect(mocks.useResponseDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          responseChannel: "email",
          responseDocumentType: "bureau_email_response",
          responseStatus: "linked_to_outcome",
          packetId: 21,
          disputePacketFindingId: 22,
          findingOutcomeId: 23,
          comparisonRunId: 24,
          limit: 25,
          offset: 5,
        }),
      );
    });
  });

  it("loads detail, shows safe metadata, and states later report comparison remains required", async () => {
    render(<AdminResponseDocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    await waitFor(() => {
      expect(mocks.useResponseDocument).toHaveBeenCalledWith(901);
    });

    expect(screen.getAllByText("Response #901").length).toBeGreaterThan(0);
    expect(screen.getAllByText("email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bureau email response").length).toBeGreaterThan(0);
    expect(screen.getAllByText("linked to outcome").length).toBeGreaterThan(0);
    expect(screen.getAllByText("21").length).toBeGreaterThan(0);
    expect(screen.getAllByText("22").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("24").length).toBeGreaterThan(0);
    expect(screen.getByText("Deterministic Response Processing")).toBeInTheDocument();
    expect(screen.getAllByText("remains").length).toBeGreaterThan(0);
    expect(screen.getAllByText("deterministic").length).toBeGreaterThan(0);
    expect(screen.getByText(/Uncertain or adverse response state remains unresolved/i)).toBeInTheDocument();
    expect(screen.getByText(/Response captured/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Later credit-report comparison is still required/i).length).toBeGreaterThan(0);
  });

  it("redacts unsafe response metadata in the detail panel", async () => {
    mocks.detailResponse = unsafeDetailResponse;
    render(<AdminResponseDocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    await screen.findByText(/Response captured/i);

    expect(document.body).not.toHaveTextContent("SHOULD_NOT_RENDER_RAW_REPORT_TEXT");
    expect(document.body).not.toHaveTextContent("1234567890123456");
    expect(document.body).not.toHaveTextContent("raw report text");
    expect(document.body).not.toHaveTextContent("raw pdf text");
    expect(document.body).not.toHaveTextContent("full email body");
    expect(document.body).not.toHaveTextContent("packet body");
    expect(document.body).not.toHaveTextContent("s3://secret/path");
    expect(document.body).not.toHaveTextContent("x-goog-signature");
    expect(document.body).not.toHaveTextContent("database_url");
    expect(document.body).not.toHaveTextContent("The bureau violated the law");
    expect(document.body).not.toHaveTextContent("this proves correction");
  });

  it("renders admin-review controls with evidence-only and later-comparison notices", async () => {
    await openResponseDetail();

    expect(screen.getByText(/Admin review updates response metadata only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Response documents remain evidence and metadata only/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/later credit-report comparison is still required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/This does not change canonical report facts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/This does not change packet readiness or wording/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/This does not create an admin override/i)).toBeInTheDocument();
    expect(screen.getByText("Mark Needs Review")).toBeInTheDocument();
    expect(screen.getByText("Mark Related")).toBeInTheDocument();
    expect(screen.getByText("Mark Unrelated")).toBeInTheDocument();
    expect(screen.getByText("Archive Response")).toBeInTheDocument();
    expect(screen.getByText("Link To Outcome")).toBeInTheDocument();
    expect(screen.getByText("Add Review Note")).toBeInTheDocument();
  });

  it("requires notes for supported admin-review actions that need them", async () => {
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "mark_needs_review" } });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mark Needs Review requires review notes");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();
  });

  it("requires confirmations before submitting admin-review mutations", async () => {
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "response reviewed. later report comparison required." },
    });
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("confirmations are required");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();
  });

  it("submits add-review-note with confirmation flags through the admin-review endpoint helper", async () => {
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "add_review_note" } });
    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "response reviewed. later report comparison required." },
    });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    await waitFor(() => {
      expect(mocks.adminReviewMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          responseId: 901,
          reviewAction: "add_review_note",
          reviewNotes: "response reviewed. later report comparison required.",
          confirmEvidenceOnly: true,
          confirmNoCanonicalChange: true,
          confirmNoOutcomeClassification: true,
        }),
      );
    });
  });

  it("requires mark related to have notes and an existing or supplied safe link", async () => {
    mocks.detailResponse = {
      ...responseRecord,
      packetId: null,
      disputePacketFindingId: null,
      comparisonRunId: null,
      findingOutcomeId: null,
    };
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "mark_related" } });
    fireEvent.change(screen.getByLabelText("Review notes"), { target: { value: "related to outcome. later report comparison required." } });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Mark Related requires an existing or supplied packet, outcome, or finding link");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Review comparison run ID"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    await waitFor(() => {
      expect(mocks.adminReviewMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          responseId: 901,
          reviewAction: "mark_related",
          comparisonRunId: 24,
          confirmEvidenceOnly: true,
          confirmNoCanonicalChange: true,
          confirmNoOutcomeClassification: true,
        }),
      );
    });
  });

  it("requires link to outcome to have notes and an outcome link", async () => {
    mocks.detailResponse = {
      ...responseRecord,
      comparisonRunId: null,
      findingOutcomeId: null,
    };
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "link_to_outcome" } });
    fireEvent.change(screen.getByLabelText("Review notes"), { target: { value: "related to outcome. later report comparison required." } });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Link To Outcome requires a comparison run ID or finding outcome ID");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Review finding outcome ID"), { target: { value: "23" } });
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    await waitFor(() => {
      expect(mocks.adminReviewMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          responseId: 901,
          reviewAction: "link_to_outcome",
          findingOutcomeId: 23,
          confirmEvidenceOnly: true,
          confirmNoCanonicalChange: true,
          confirmNoOutcomeClassification: true,
        }),
      );
    });
  });

  it("allows archive response only with notes or explicit confirmation", async () => {
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review action"), { target: { value: "archive_response" } });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Archive Response requires review notes or explicit archive confirmation");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/explicitly confirm archiving this response metadata/i));
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    await waitFor(() => {
      expect(mocks.adminReviewMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          responseId: 901,
          reviewAction: "archive_response",
          explicitConfirmation: true,
          confirmEvidenceOnly: true,
          confirmNoCanonicalChange: true,
          confirmNoOutcomeClassification: true,
        }),
      );
    });
  });

  it("rejects unsafe review notes before submitting", async () => {
    await openResponseDetail();

    fireEvent.change(screen.getByLabelText("Review notes"), {
      target: { value: "SIN 123-456-789 and account number 1234567890123456 raw report text" },
    });
    checkRequiredConfirmations();
    fireEvent.click(screen.getByRole("button", { name: /save metadata review/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("full SIN-like values");
    expect(mocks.adminReviewMutateAsync).not.toHaveBeenCalled();
  });

  it("does not render unsupported response, legal, parser, inbox, or override controls", async () => {
    await openResponseDetail();

    expect(screen.queryByRole("button", { name: /review response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark corrected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark removed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark unchanged/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /override outcome/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prove correction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /legal violation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^activate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enforce/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /demand/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inbox sync/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect gmail/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect imap/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect outlook/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /parse response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make final truth/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /force outcome/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/you won/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/entitled to damages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/admitted fault/i)).not.toBeInTheDocument();
  });

  it("keeps source limited to response list/get endpoints and avoids forbidden runtime paths", () => {
    const source = [
      readFileSync(join(process.cwd(), "helpers/responseDocumentQueries.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "pages/admin-response-documents.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "helpers/adminSidebarRoutes.ts"), "utf8"),
      readFileSync(join(process.cwd(), "components/AppLayout.tsx"), "utf8"),
    ].join("\n");

    expect(source).toContain("list_GET.schema");
    expect(source).toContain("get_GET.schema");
    expect(source).toContain("metrics_GET.schema");
    expect(source).toContain("admin-review_POST.schema");
    expect(source).toContain("capture_POST.schema");
    expect(source).toContain("queue_GET.schema");
    expect(source).toContain("queue-remediation_POST.schema");
    expect(source).toContain("intakeSourceType");
    expect(source).toContain("invalidateQueries");
    expect(source).not.toMatch(/useBureauCommunication|bureau-communication_POST|record-response_POST/i);
    expect(source).not.toMatch(/\/_api\/parser|\/_api\/ocr|\/_api\/ingest\/process/i);
    expect(source).not.toMatch(/\/_api\/packet\/(?:readiness|build|create|save|send|delivery|pdf)/i);
    expect(source).not.toMatch(/\/_api\/violations\/run|\/_api\/creditor-validation\/run/i);
    expect(source).not.toMatch(/\/_api\/regulation-registry\/runtime-bridge\/activate/i);
    expect(source).not.toMatch(/\/_api\/admin\/override|\/_api\/furnisher\/packet/i);
    expect(source).not.toMatch(/\/_api\/gmail|\/_api\/imap|\/_api\/mailbox|\/_api\/inbox/i);
    expect(source).not.toMatch(/\/_api\/report-artifact\/(?:create|update)|\/_api\/tradelines\/update|\/_api\/canonical/i);
  });
});
