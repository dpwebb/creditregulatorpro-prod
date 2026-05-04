export type MockLifecycleJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED";

export type MockLifecycleCoverageSummary = {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
};

export type MockLifecycleRunConfig = {
  initialReportPath: string;
  followupReportPath: string;
  simulateDays: number;
  packetCount: number;
  strict: boolean;
  useDbAssist: boolean;
  baseUrl: string;
  origin: string;
  email?: string;
  password?: string;
  displayName?: string;
  legalNameSignature?: string;
};

export type MockLifecycleJobRecord = {
  jobId: string;
  status: MockLifecycleJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  initiatedByUserId: number;
  initiatedByEmail: string;
  input: MockLifecycleRunConfig;
  runOutputDir: string;
  jsonReportPath: string | null;
  markdownReportPath: string | null;
  coverageSummary: MockLifecycleCoverageSummary | null;
  error: string | null;
  logs: string[];
};

