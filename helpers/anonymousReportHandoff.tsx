import type { InputType as UploadReportInput } from "../endpoints/ingest/report_POST.schema";

const MAX_HANDOFF_AGE_MS = 30 * 60 * 1000;

type PendingAnonymousReport = {
  payload: UploadReportInput;
  createdAt: number;
};

let pendingAnonymousReport: PendingAnonymousReport | null = null;

export function storeAnonymousReportForSignup(payload: UploadReportInput) {
  pendingAnonymousReport = {
    payload,
    createdAt: Date.now(),
  };
}

export function takeAnonymousReportForSignup(): UploadReportInput | null {
  const payload = getAnonymousReportForSignup();
  pendingAnonymousReport = null;
  return payload;
}

export function getAnonymousReportForSignup(): UploadReportInput | null {
  if (!pendingAnonymousReport) {
    return null;
  }

  const pending = pendingAnonymousReport;

  if (Date.now() - pending.createdAt > MAX_HANDOFF_AGE_MS) {
    pendingAnonymousReport = null;
    return null;
  }

  return pending.payload;
}

export function clearAnonymousReportForSignup() {
  pendingAnonymousReport = null;
}
