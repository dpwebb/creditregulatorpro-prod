import { schema, OutputType } from "./create-support-agent_POST.schema";

import { randomBytes } from "crypto";
import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { generatePasswordHash } from "../../helpers/generatePasswordHash";
import { sendGridEmail } from "../../helpers/sendGridEmail";
import { logAudit } from "../../helpers/auditLogger";
import { sql } from "kysely";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    if (user.role !== "admin") {
      throw new BusinessRuleError("Only admins can create support agents", 403);
    }
    
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);
    const normalizedEmail = result.email.trim().toLowerCase();
    const normalizedDisplayName = result.displayName.trim();

    if (!normalizedDisplayName) {
      throw new BusinessRuleError("Display name is required", 400);
    }

    const existingUser = await db
      .selectFrom("users")
      .where(sql<boolean>`lower(users.email) = ${normalizedEmail}`)
      .selectAll()
      .executeTakeFirst();
      
    if (existingUser) {
      throw new BusinessRuleError("Email already in use", 400);
    }

    const newUser = await db.transaction().execute(async (trx) => {
      const insertedUser = await trx
        .insertInto("users")
        .values({
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          role: "support",
          emailVerified: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const passwordHash = await generatePasswordHash(result.password);

      await trx
        .insertInto("userPasswords")
        .values({
          userId: insertedUser.id,
          passwordHash,
        })
        .execute();

      await trx
        .insertInto("userAccount")
        .values({
          userId: insertedUser.id,
          email: normalizedEmail,
          role: "support",
          fullName: normalizedDisplayName,
        })
        .execute();

      return insertedUser;
    });

    // Generate a password reset token for the new agent so they can set their own password
    const resetToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await db
      .insertInto("passwordResetTokens")
      .values({
        userId: newUser.id,
        token: resetToken,
        expiresAt,
      })
      .execute();

    console.log(`Password reset token created for new support agent userId=${newUser.id}`);
    await logAudit({
      action: "CREATE",
      entityType: "USER_ACCOUNT",
      entityId: newUser.id,
      userId: user.id,
      details: {
        action: "CREATE_SUPPORT_AGENT",
        agentEmail: normalizedEmail,
      },
      status: "SUCCESS",
      request,
    });

    const requestUrl = new URL(request.url);
    const originHeader = request.headers.get("origin");
    let frontendOrigin = requestUrl.origin;
    if (originHeader) {
      try {
        const originUrl = new URL(originHeader);
        if (originUrl.hostname === requestUrl.hostname) {
          frontendOrigin = originHeader;
        }
      } catch {
        frontendOrigin = requestUrl.origin;
      }
    }
    const setPasswordUrl = `${frontendOrigin.replace(/\/$/, "")}/reset-password?token=${resetToken}`;

    await sendGridEmail({
      to: normalizedEmail,
      subject: "Welcome to Credit Regulator Pro Support Team",
      html: `
        <p>Hello ${normalizedDisplayName},</p>
        <p>Welcome to the support team. Click below to set your password.</p>
        <p><a href="${setPasswordUrl}" style="display:inline-block;padding:12px 24px;background:#FF2A2A;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Set Your Password</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not expect this email, please contact your administrator.</p>
      `,
      text: `Hello ${normalizedDisplayName},\n\nWelcome to the support team. Click the link below to set your password:\n\n${setPasswordUrl}\n\nThis link expires in 24 hours.`,
    }).catch((e) => console.error("Failed to send agent creation email", e));

    return new Response(JSON.stringify({ user: newUser } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
