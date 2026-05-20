import {
  ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
  AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
  BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
  EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
  formatUploadLimit,
} from "./uploadPayloadValidation";

export const FRONTEND_UPLOAD_LIMITS = {
  authenticatedReport: {
    maxBytes: AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
    label: formatUploadLimit(AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES),
  },
  anonymousReport: {
    maxBytes: ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
    label: formatUploadLimit(ANONYMOUS_REPORT_UPLOAD_MAX_BYTES),
  },
  evidenceAttachment: {
    maxBytes: EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
    label: formatUploadLimit(EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES),
  },
  bureauCommunication: {
    maxBytes: BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
    label: formatUploadLimit(BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES),
  },
} as const;

export const FRONTEND_LIMITED_BETA_READINESS = {
  classification: "Limited beta only under strict constraints",
  notReady:
    "Not broad-production ready. Not production-at-scale ready.",
  uploadPolicy:
    "Operator policy allows one active report upload/process operation across beta. This is a policy gate, not a runtime throttle.",
  populationPolicy:
    "Operator policy caps beta participation at 5 consumers and 3 concurrent active users.",
} as const;
