import { schema, OutputType } from "./reset_password_POST.schema";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { db } from "../../helpers/db";
import { generatePasswordHash } from "../../helpers/generatePasswordHash";


export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const tokenRecord = await db
      .selectFrom("passwordResetTokens")
      .select(["id", "userId", "expiresAt", "used"])
      .where("token", "=", result.token)
      .executeTakeFirst();

    if (!tokenRecord) {
      throw new BusinessRuleError("Invalid or expired reset token.");
    }
    if (tokenRecord.used) {
      throw new BusinessRuleError("This reset link has already been used.");
    }
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new BusinessRuleError("This reset link has expired.");
    }

    const passwordHash = await generatePasswordHash(result.newPassword);

    await db.transaction().execute(async (trx) => {
      // 1. Mark token as used
      await trx
        .updateTable("passwordResetTokens")
        .set({ used: true })
        .where("id", "=", tokenRecord.id)
        .execute();

      // 2. Update or insert the password
      const existingPassword = await trx
        .selectFrom("userPasswords")
        .select("userId")
        .where("userId", "=", tokenRecord.userId)
        .executeTakeFirst();

      if (existingPassword) {
        await trx
          .updateTable("userPasswords")
          .set({ passwordHash })
          .where("userId", "=", tokenRecord.userId)
          .execute();
      } else {
        await trx
          .insertInto("userPasswords")
          .values({ userId: tokenRecord.userId, passwordHash })
          .execute();
      }

      // 3. Delete all sessions to force logout on all devices
      await trx
        .deleteFrom("sessions")
        .where("userId", "=", tokenRecord.userId)
        .execute();
    });

    return new Response(
      JSON.stringify({ success: true } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}