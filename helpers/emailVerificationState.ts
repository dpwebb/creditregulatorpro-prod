import type { Kysely } from "kysely";
import { db } from "./db";
import { logAudit } from "./auditLogger";
import { logger } from "./logger";
import type { DB } from "./schema";

type EmailVerificationExecutor = Pick<Kysely<DB>, "selectFrom" | "updateTable">;

export type EmailVerificationReconciliationSource =
  | "password_login"
  | "session_hydration"
  | "establish_session"
  | "request_verification_email"
  | "verify_email_token_replay";

export type EmailVerificationStateResult = {
  emailVerified: boolean;
  reconciled: boolean;
};

export async function reconcileEmailVerifiedFromVerifiedToken(params: {
  userId: number;
  currentEmailVerified: boolean | null | undefined;
  source: EmailVerificationReconciliationSource;
  request?: Request;
  executor?: EmailVerificationExecutor;
}): Promise<EmailVerificationStateResult> {
  const { userId, currentEmailVerified, source, request, executor = db } = params;

  if (currentEmailVerified === true) {
    return { emailVerified: true, reconciled: false };
  }

  const verifiedToken = await executor
    .selectFrom("emailVerificationTokens")
    .select("id")
    .where("userId", "=", userId)
    .where("verified", "=", true)
    .limit(1)
    .executeTakeFirst();

  if (!verifiedToken) {
    return { emailVerified: false, reconciled: false };
  }

  const updatedUsers = await executor
    .updateTable("users")
    .set({ emailVerified: true })
    .where("id", "=", userId)
    .where("emailVerified", "=", false)
    .returning("id")
    .execute();

  const reconciled = updatedUsers.length > 0;

  if (reconciled) {
    logger.info("Email verification state reconciled", { userId, source });

    await logAudit({
      action: "UPDATE",
      entityType: "USER_ACCOUNT",
      entityId: userId,
      userId,
      status: "SUCCESS",
      request,
      details: {
        event: "email_verification_reconciled",
        source,
        canonicalField: "users.emailVerified",
        previousEmailVerified: false,
        emailVerified: true,
      },
    });
  }

  return { emailVerified: true, reconciled };
}
