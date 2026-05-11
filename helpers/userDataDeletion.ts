import postgres from "postgres";

import { db } from "./db";
import {
  deleteConsumerIdentificationDocument,
  ensureConsumerIdentificationSchema,
} from "./consumerIdentification";
import { deleteUserReportDataCascade } from "./deleteReportArtifactCascade";
import { deleteStoredFile } from "./gcsStorage";
import { logAudit } from "./auditLogger";
import {
  USER_DATA_DELETION_CATEGORIES,
  type UserDataCategorySummary,
  type UserDataDeletionCategory,
  type UserDataDeletionResult,
  type UserDataSummary,
} from "./userDataDeletionTypes";

export { USER_DATA_DELETION_CATEGORIES } from "./userDataDeletionTypes";
export type {
  UserDataCategorySummary,
  UserDataDeletionCategory,
  UserDataDeletionResult,
  UserDataSummary,
} from "./userDataDeletionTypes";

const CATEGORY_TEXT: Record<UserDataDeletionCategory, Omit<UserDataCategorySummary, "key" | "count">> = {
  profile: {
    label: "Profile and contact details",
    description: "Name, address, phone, date of birth, saved signature text, avatar, and display name.",
  },
  identification: {
    label: "Identification image",
    description: "The saved ID image used with credit bureau, furnisher, and collection agency communications.",
  },
  creditData: {
    label: "Credit reports and disputes",
    description: "Uploaded reports, extracted accounts, dispute packets, obligations, deadlines, evidence, postal records, and bankruptcy records tied to reports.",
  },
  identityProtection: {
    label: "Identity theft protection records",
    description: "Saved fraud freeze, thaw, and identity theft protection records.",
  },
  signatures: {
    label: "Saved signatures",
    description: "Signature records saved for generated letters and identity workflows.",
  },
  support: {
    label: "Support tickets",
    description: "Support tickets and messages opened from this consumer account.",
  },
  notifications: {
    label: "Notifications",
    description: "Regulatory and platform notifications assigned to this account.",
  },
  betaReports: {
    label: "Issue reports",
    description: "Bug, beta, or product issue reports submitted from this account.",
  },
};

type MutationResult = {
  numDeletedRows?: bigint | number | string | null;
  numUpdatedRows?: bigint | number | string | null;
};

type UserFkReference = {
  table_schema: string;
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  delete_rule: string;
};

function mutationCount(result: MutationResult): number {
  return Number(result.numDeletedRows ?? result.numUpdatedRows ?? 0);
}

function addCount(counts: Record<string, number>, key: string, value: number): void {
  counts[key] = (counts[key] ?? 0) + value;
}

function isOptionalSchemaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (((error as { code?: unknown }).code === "42P01") ||
      ((error as { code?: unknown }).code === "42703"))
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23503"
  );
}

async function runOptionalDeleteStep(
  stepName: string,
  fn: () => Promise<number>
): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    if (!isOptionalSchemaError(error)) {
      throw error;
    }

    console.warn(`[User Data Deletion] Optional step skipped (${stepName}) due to schema mismatch:`, error);
    return 0;
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function countTable(
  tableName:
    | "betaIssueReport"
    | "consumerIdentificationDocument"
    | "consumerSignature"
    | "identityTheftFreeze"
    | "packet"
    | "postalTransaction"
    | "regulatoryNotification"
    | "reportArtifact"
    | "tradeline"
    | "userAccount",
  userId: number
): Promise<number> {
  const result = await db
    .selectFrom(tableName)
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .where("userId", "=", userId)
    .executeTakeFirst();

  return Number(result?.total ?? 0);
}

async function countObligationInstances(userId: number): Promise<number> {
  const result = await db
    .selectFrom("obligationInstance")
    .leftJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .where((eb) =>
      eb.or([
        eb("obligationInstance.userId", "=", userId),
        eb("tradeline.userId", "=", userId),
      ])
    )
    .executeTakeFirst();

  return Number(result?.total ?? 0);
}

async function countEvidenceAttachments(userId: number): Promise<number> {
  const result = await db
    .selectFrom("evidenceAttachment")
    .leftJoin("packet", "packet.id", "evidenceAttachment.packetId")
    .leftJoin("obligationInstance", "obligationInstance.id", "evidenceAttachment.obligationInstanceId")
    .leftJoin("tradeline as packetTradeline", "packetTradeline.id", "packet.tradelineId")
    .leftJoin("tradeline as obligationTradeline", "obligationTradeline.id", "obligationInstance.tradelineId")
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .where((eb) =>
      eb.or([
        eb("evidenceAttachment.uploadedBy", "=", userId),
        eb("packet.userId", "=", userId),
        eb("obligationInstance.userId", "=", userId),
        eb("packetTradeline.userId", "=", userId),
        eb("obligationTradeline.userId", "=", userId),
      ])
    )
    .executeTakeFirst();

  return Number(result?.total ?? 0);
}

async function countBankruptcyRecords(userId: number): Promise<number> {
  const result = await db
    .selectFrom("bankruptcyRecord")
    .leftJoin("tradeline", "tradeline.id", "bankruptcyRecord.tradelineId")
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .where((eb) =>
      eb.or([
        eb("bankruptcyRecord.userId", "=", userId),
        eb("tradeline.userId", "=", userId),
      ])
    )
    .executeTakeFirst();

  return Number(result?.total ?? 0);
}

async function getSupportCounts(userId: number): Promise<{ tickets: number; messages: number }> {
  const ticketRows = await db
    .selectFrom("supportTicket")
    .select("id")
    .where("userId", "=", userId)
    .execute();

  const ticketIds = ticketRows.map((ticket) => ticket.id);

  let messagesQuery = db
    .selectFrom("supportTicketMessage")
    .select((eb) => eb.fn.countAll<string>().as("total"));

  if (ticketIds.length > 0) {
    messagesQuery = messagesQuery.where((eb) =>
      eb.or([
        eb("ticketId", "in", ticketIds),
        eb("senderId", "=", userId),
      ])
    );
  } else {
    messagesQuery = messagesQuery.where("senderId", "=", userId);
  }

  const messageCount = await messagesQuery.executeTakeFirst();

  return {
    tickets: ticketIds.length,
    messages: Number(messageCount?.total ?? 0),
  };
}

async function collectStoredFileUrlsForCreditData(userId: number): Promise<string[]> {
  const [reportFiles, evidenceFiles] = await Promise.all([
    db
      .selectFrom("reportArtifact")
      .select("storageUrl")
      .where("userId", "=", userId)
      .where("storageUrl", "is not", null)
      .execute(),
    db
      .selectFrom("evidenceAttachment")
      .leftJoin("packet", "packet.id", "evidenceAttachment.packetId")
      .leftJoin("obligationInstance", "obligationInstance.id", "evidenceAttachment.obligationInstanceId")
      .leftJoin("tradeline as packetTradeline", "packetTradeline.id", "packet.tradelineId")
      .leftJoin("tradeline as obligationTradeline", "obligationTradeline.id", "obligationInstance.tradelineId")
      .select("evidenceAttachment.storageUrl")
      .where((eb) =>
        eb.or([
          eb("evidenceAttachment.uploadedBy", "=", userId),
          eb("packet.userId", "=", userId),
          eb("obligationInstance.userId", "=", userId),
          eb("packetTradeline.userId", "=", userId),
          eb("obligationTradeline.userId", "=", userId),
        ])
      )
      .execute(),
  ]);

  return Array.from(
    new Set(
      [...reportFiles, ...evidenceFiles]
        .map((row) => row.storageUrl)
        .filter((storageUrl): storageUrl is string => Boolean(storageUrl))
    )
  );
}

async function deleteStoredFiles(storageUrls: string[]): Promise<number> {
  let deletedFiles = 0;

  for (const storageUrl of storageUrls) {
    try {
      await deleteStoredFile(storageUrl);
      deletedFiles++;
    } catch (error) {
      console.warn("[User Data Deletion] Failed to delete stored file", error);
    }
  }

  return deletedFiles;
}

async function deleteProfileData(userId: number): Promise<number> {
  const user = await db
    .selectFrom("users")
    .select("email")
    .where("id", "=", userId)
    .executeTakeFirst();

  let changedRows = 0;

  if (user) {
    const userResult = await db
      .updateTable("users")
      .set({
        displayName: user.email,
        avatarUrl: null,
      })
      .where("id", "=", userId)
      .executeTakeFirst();
    changedRows += mutationCount(userResult);
  }

  const accountResult = await db
    .updateTable("userAccount")
    .set({
      fullName: null,
      legalNameSignature: null,
      dateOfBirth: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
    })
    .where("userId", "=", userId)
    .executeTakeFirst();

  changedRows += mutationCount(accountResult);
  return changedRows;
}

async function deleteSupportData(userId: number): Promise<Record<string, number>> {
  const ticketRows = await db
    .selectFrom("supportTicket")
    .select("id")
    .where("userId", "=", userId)
    .execute();
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const counts: Record<string, number> = {};

  let messagesResult;
  if (ticketIds.length > 0) {
    messagesResult = await db
      .deleteFrom("supportTicketMessage")
      .where((eb) =>
        eb.or([
          eb("ticketId", "in", ticketIds),
          eb("senderId", "=", userId),
        ])
      )
      .executeTakeFirst();
  } else {
    messagesResult = await db
      .deleteFrom("supportTicketMessage")
      .where("senderId", "=", userId)
      .executeTakeFirst();
  }

  counts.supportTicketMessages = mutationCount(messagesResult);

  if (ticketIds.length > 0) {
    const ticketsResult = await db
      .deleteFrom("supportTicket")
      .where("id", "in", ticketIds)
      .executeTakeFirst();
    counts.supportTickets = mutationCount(ticketsResult);
  } else {
    counts.supportTickets = 0;
  }

  return counts;
}

async function deleteCreditData(userId: number, actorUserId: number, request?: Request): Promise<Record<string, number>> {
  const storageUrls = await collectStoredFileUrlsForCreditData(userId);
  const resetCounts = await deleteUserReportDataCascade(userId, actorUserId, request);
  const uploadedEvidenceResult = await db
    .deleteFrom("evidenceAttachment")
    .where("uploadedBy", "=", userId)
    .executeTakeFirst();
  const storedFilesDeleted = await deleteStoredFiles(storageUrls);

  return {
    reportArtifacts: resetCounts.deletedReportArtifacts,
    tradelines: resetCounts.deletedTradelines,
    packets: resetCounts.deletedPackets,
    obligationInstances: resetCounts.deletedObligationInstances,
    evidenceAttachments: mutationCount(uploadedEvidenceResult),
    bankruptcyRecords: resetCounts.deletedBankruptcyRecords,
    postalTransactions: resetCounts.deletedPostalTransactions,
    storedFiles: storedFilesDeleted,
  };
}

async function deleteUserAuthAndAccountRows(userId: number, email: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  counts.subscriptions = await runOptionalDeleteStep("subscriptions", async () =>
    mutationCount(await db.deleteFrom("subscriptions").where("userId", "=", userId).executeTakeFirst())
  );
  counts.emailVerificationTokens = await runOptionalDeleteStep("emailVerificationTokens", async () =>
    mutationCount(await db.deleteFrom("emailVerificationTokens").where("userId", "=", userId).executeTakeFirst())
  );
  counts.sessions = await runOptionalDeleteStep("sessions", async () =>
    mutationCount(await db.deleteFrom("sessions").where("userId", "=", userId).executeTakeFirst())
  );
  counts.oauthAccounts = await runOptionalDeleteStep("oauthAccounts", async () =>
    mutationCount(await db.deleteFrom("oauthAccounts").where("userId", "=", userId).executeTakeFirst())
  );
  counts.passwordResetTokens = await runOptionalDeleteStep("passwordResetTokens", async () =>
    mutationCount(await db.deleteFrom("passwordResetTokens").where("userId", "=", userId).executeTakeFirst())
  );
  counts.userPasswords = await runOptionalDeleteStep("userPasswords", async () =>
    mutationCount(await db.deleteFrom("userPasswords").where("userId", "=", userId).executeTakeFirst())
  );
  counts.loginAttempts = await runOptionalDeleteStep("loginAttempts", async () =>
    mutationCount(await db.deleteFrom("loginAttempts").where("email", "=", email).executeTakeFirst())
  );
  counts.leadReminders = await runOptionalDeleteStep("leadReminder", async () =>
    mutationCount(await db.deleteFrom("leadReminder").where("email", "=", email).executeTakeFirst())
  );
  counts.userAccount = await runOptionalDeleteStep("userAccount", async () =>
    mutationCount(await db.deleteFrom("userAccount").where("userId", "=", userId).executeTakeFirst())
  );
  counts.auditLogs = await runOptionalDeleteStep("auditLog", async () =>
    mutationCount(await db.deleteFrom("auditLog").where("userId", "=", userId).executeTakeFirst())
  );

  return counts;
}

async function runDynamicUserFkCleanup(
  targetUserId: number,
  purgedCounts: Record<string, number>
): Promise<void> {
  const sqlClient = postgres(process.env.FLOOT_DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
  });

  try {
    const references = await sqlClient<UserFkReference[]>`
      select
        kcu.table_schema,
        kcu.table_name,
        kcu.column_name,
        cols.is_nullable,
        rc.delete_rule
      from information_schema.referential_constraints rc
      join information_schema.key_column_usage kcu
        on rc.constraint_catalog = kcu.constraint_catalog
       and rc.constraint_schema = kcu.constraint_schema
       and rc.constraint_name = kcu.constraint_name
      join information_schema.constraint_column_usage ccu
        on rc.unique_constraint_catalog = ccu.constraint_catalog
       and rc.unique_constraint_schema = ccu.constraint_schema
       and rc.unique_constraint_name = ccu.constraint_name
      join information_schema.columns cols
        on cols.table_schema = kcu.table_schema
       and cols.table_name = kcu.table_name
       and cols.column_name = kcu.column_name
      where ccu.table_schema = 'public'
        and ccu.table_name = 'users'
        and ccu.column_name = 'id'
        and kcu.table_schema = 'public'
      order by kcu.table_name, kcu.column_name
    `;

    for (const reference of references) {
      if (reference.table_name === "users") continue;

      const normalizedDeleteRule = reference.delete_rule.toUpperCase();
      if (normalizedDeleteRule === "CASCADE" || normalizedDeleteRule === "SET NULL") {
        continue;
      }

      const tableName = quoteIdentifier(reference.table_name);
      const columnName = quoteIdentifier(reference.column_name);
      const countKey = `dynamicFk_${reference.table_name}_${reference.column_name}`;

      if (reference.is_nullable === "YES") {
        const result = await sqlClient`
          update ${sqlClient.unsafe(tableName)}
          set ${sqlClient.unsafe(columnName)} = null
          where ${sqlClient.unsafe(columnName)} = ${targetUserId}
        `;
        purgedCounts[countKey] = Number(result.count || 0);
      } else {
        const result = await sqlClient`
          delete from ${sqlClient.unsafe(tableName)}
          where ${sqlClient.unsafe(columnName)} = ${targetUserId}
        `;
        purgedCounts[countKey] = Number(result.count || 0);
      }
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

export async function getUserDataSummary(userId: number): Promise<UserDataSummary> {
  await ensureConsumerIdentificationSchema();

  const [
    profileRows,
    identificationRows,
    reportArtifacts,
    tradelines,
    packets,
    obligationInstances,
    evidenceAttachments,
    bankruptcyRecords,
    postalTransactions,
    identityProtection,
    signatures,
    supportCounts,
    notifications,
    betaReports,
  ] = await Promise.all([
    countTable("userAccount", userId),
    countTable("consumerIdentificationDocument", userId),
    countTable("reportArtifact", userId),
    countTable("tradeline", userId),
    countTable("packet", userId),
    countObligationInstances(userId),
    countEvidenceAttachments(userId),
    countBankruptcyRecords(userId),
    countTable("postalTransaction", userId),
    countTable("identityTheftFreeze", userId),
    countTable("consumerSignature", userId),
    getSupportCounts(userId),
    countTable("regulatoryNotification", userId),
    countTable("betaIssueReport", userId),
  ]);

  const counts: Record<UserDataDeletionCategory, number> = {
    profile: profileRows,
    identification: identificationRows,
    creditData:
      reportArtifacts +
      tradelines +
      packets +
      obligationInstances +
      evidenceAttachments +
      bankruptcyRecords +
      postalTransactions,
    identityProtection,
    signatures,
    support: supportCounts.tickets + supportCounts.messages,
    notifications,
    betaReports,
  };

  const categories = USER_DATA_DELETION_CATEGORIES.map((key) => ({
    key,
    ...CATEGORY_TEXT[key],
    count: counts[key],
  }));

  return {
    categories,
    totalCount: categories.reduce((total, category) => total + category.count, 0),
  };
}

export async function deleteUserDataCategories(input: {
  userId: number;
  actorUserId: number;
  categories: UserDataDeletionCategory[];
  request?: Request;
}): Promise<UserDataDeletionResult> {
  const purgedCounts: Record<string, number> = {};
  const categories = USER_DATA_DELETION_CATEGORIES.filter((category) =>
    input.categories.includes(category)
  );

  for (const category of categories) {
    if (category === "profile") {
      addCount(purgedCounts, "profileRecordsCleared", await deleteProfileData(input.userId));
    } else if (category === "identification") {
      addCount(
        purgedCounts,
        "consumerIdentificationDocuments",
        (await deleteConsumerIdentificationDocument(input.userId)) ? 1 : 0
      );
    } else if (category === "creditData") {
      const creditCounts = await deleteCreditData(input.userId, input.actorUserId, input.request);
      for (const [key, value] of Object.entries(creditCounts)) {
        addCount(purgedCounts, key, value);
      }
    } else if (category === "identityProtection") {
      addCount(
        purgedCounts,
        "identityTheftFreezes",
        mutationCount(await db.deleteFrom("identityTheftFreeze").where("userId", "=", input.userId).executeTakeFirst())
      );
    } else if (category === "signatures") {
      addCount(
        purgedCounts,
        "consumerSignatures",
        mutationCount(await db.deleteFrom("consumerSignature").where("userId", "=", input.userId).executeTakeFirst())
      );
    } else if (category === "support") {
      const supportCounts = await deleteSupportData(input.userId);
      for (const [key, value] of Object.entries(supportCounts)) {
        addCount(purgedCounts, key, value);
      }
    } else if (category === "notifications") {
      addCount(
        purgedCounts,
        "regulatoryNotifications",
        mutationCount(await db.deleteFrom("regulatoryNotification").where("userId", "=", input.userId).executeTakeFirst())
      );
    } else if (category === "betaReports") {
      addCount(
        purgedCounts,
        "betaIssueReports",
        mutationCount(await db.deleteFrom("betaIssueReport").where("userId", "=", input.userId).executeTakeFirst())
      );
    }
  }

  return {
    success: true,
    purgedCounts,
  };
}

export async function deleteUserAccountCascade(input: {
  userId: number;
  email: string;
  request?: Request;
}): Promise<UserDataDeletionResult> {
  const purgedCounts: Record<string, number> = {};

  const dataDeletion = await deleteUserDataCategories({
    userId: input.userId,
    actorUserId: input.userId,
    categories: [...USER_DATA_DELETION_CATEGORIES],
    request: input.request,
  });

  for (const [key, value] of Object.entries(dataDeletion.purgedCounts)) {
    addCount(purgedCounts, key, value);
  }

  const authCounts = await deleteUserAuthAndAccountRows(input.userId, input.email);
  for (const [key, value] of Object.entries(authCounts)) {
    addCount(purgedCounts, key, value);
  }

  await runDynamicUserFkCleanup(input.userId, purgedCounts);

  try {
    const userResult = await db
      .deleteFrom("users")
      .where("id", "=", input.userId)
      .executeTakeFirst();
    purgedCounts.users = mutationCount(userResult);
  } catch (error) {
    if (!isForeignKeyViolation(error)) {
      throw error;
    }

    await runDynamicUserFkCleanup(input.userId, purgedCounts);
    const retryResult = await db
      .deleteFrom("users")
      .where("id", "=", input.userId)
      .executeTakeFirst();
    purgedCounts.users = mutationCount(retryResult);
  }

  await logAudit({
    action: "DELETE",
    entityType: "USER_ACCOUNT",
    entityId: null,
    userId: null,
    details: {
      action: "SELF_ACCOUNT_DELETION",
      deletedUserId: input.userId,
      purgedCounts,
    },
    status: "SUCCESS",
    request: input.request,
  });

  return {
    success: true,
    purgedCounts,
  };
}
