import { z } from "zod";

export const PLATFORM_RESET_CONFIRMATION_PHRASE = "RESET STAGING PLATFORM";
export const ADMIN_PLATFORM_RESET_HEADER = "x-crp-admin-platform-reset";

export const resetModeSchema = z.enum(["soft", "hard"]);

export const platformResetDatabaseSchema = z.object({
  source: z.string(),
  host: z.string(),
  port: z.string(),
  database: z.string(),
});

export const schema = z.object({
  mode: resetModeSchema.default("hard"),
  baseUrl: z.string().url().optional(),
}).strict();

export type PlatformResetMode = z.infer<typeof resetModeSchema>;
export type PlatformResetDatabase = z.infer<typeof platformResetDatabaseSchema>;
export type InputType = z.infer<typeof schema>;

export type PlatformResetUserPreview = {
  id: number;
  email: string;
  displayName?: string | null;
  role?: string | null;
  createdAt?: string | null;
  reason: string;
};

export type PlatformResetCountRow = {
  table?: string;
  column?: string;
  count?: number;
  skipped?: boolean;
  reason?: string;
  action?: string;
  nextValue?: number;
};

export type PlatformResetFileTarget = {
  id: string;
  relativePath: string;
  absolutePath: string;
  fileCount: number;
  bytes: number;
  action: string;
};

export type PlatformResetValidationCheck = {
  name: string;
  status: "pass" | "warn" | "fail" | string;
  detail?: string;
};

export type PlatformResetStorageReference = {
  table: string;
  column: string;
  area: string;
  storageUrl: string;
  count: number;
  objectName?: string;
  status?: string;
  reason?: string;
  error?: string;
};

export type PlatformResetResult = {
  event: "platform_reset" | string;
  mode: string;
  resetScope: PlatformResetMode;
  generatedAt: string;
  environment: { kind: string; reason: string };
  database: PlatformResetDatabase;
  preservedSubsystems: string[];
  preservedTables: string[];
  adminPreservation?: {
    configuredAdminEmails: string[];
    allowMultiplePreservedAdmins: boolean;
    preservedAdminCount: number;
    preservedAdminEmails: string[];
    requiresExactlyOneAdmin: boolean;
  };
  userPlan: {
    usersTableMissing: boolean;
    preservedUsers: PlatformResetUserPreview[];
    deletedUsers: PlatformResetUserPreview[];
    preservedCount: number;
    deletedCount: number;
    reportLimit: number;
  };
  updateResults: PlatformResetCountRow[];
  rowsByTable: PlatformResetCountRow[];
  identityResults: PlatformResetCountRow[];
  filesByTarget: PlatformResetFileTarget[];
  storage?: {
    provider: {
      provider: string;
      configuredPath: string;
      root: string;
    };
    health: Record<string, unknown>;
    references: {
      provider: Record<string, unknown>;
      byArea: Array<{ area: string; references: number; rows: number }>;
      totalReferences: number;
      totalRows: number;
      localReadable: number;
      localReferences: PlatformResetStorageReference[];
      unsupportedReferences: PlatformResetStorageReference[];
      notFoundReferences: PlatformResetStorageReference[];
      failedReferences: PlatformResetStorageReference[];
    };
    deletion: {
      action?: string;
      deletedCount: number;
      deleted: PlatformResetStorageReference[];
      notFoundReferences: PlatformResetStorageReference[];
      unsupportedReferences: PlatformResetStorageReference[];
      failedReferences: PlatformResetStorageReference[];
    } | null;
  };
  totalRowsMatched: number;
  totalUpdatesMatched: number;
  totalFilesMatched: number;
  validation: PlatformResetValidationCheck[];
};

export type OutputType = {
  success: boolean;
  result: PlatformResetResult;
};

async function parseApiError(response: Response): Promise<Error> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return new Error(parsed.error || "Platform reset request failed.");
  } catch {
    return new Error(text || "Platform reset request failed.");
  }
}

export const postAdminPlatformResetDryRun = async (
  body: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const result = await fetch(`/_api/admin/platform-reset/dry-run`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      [ADMIN_PLATFORM_RESET_HEADER]: "1",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    throw await parseApiError(result);
  }

  return result.json() as Promise<OutputType>;
};
