import { schema, OutputType } from "./request_password_reset_POST.schema";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { db } from "../../helpers/db";
import { sendGridEmail } from "../../helpers/sendGridEmail";
import crypto from "crypto";


export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    // Rate limit: 3 requests per hour per email
    const rl = await checkRateLimit(result.email, "PASSWORD_RESET", 3, 60);
    if (!rl.allowed) {
      throw new BusinessRuleError("Too many requests. Please try again later.", 429);
    }

    const user = await db
      .selectFrom("users")
      .select(["id", "email"])
      .where("email", "=", result.email.toLowerCase().trim())
      .executeTakeFirst();

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

      await db
        .insertInto("passwordResetTokens")
        .values({
          token,
          userId: user.id,
          expiresAt,
          used: false,
        })
        .execute();

      const resetLink = `https://www.creditregulatorpro.com/reset-password?token=${token}`;
      
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #FF2A2A;">Credit Regulator Pro</h2>
          <p>Hello,</p>
          <p>You requested a password reset for your account.</p>
          <p>Click the link below to set a new password:</p>
          <p><a href="${resetLink}" style="display: inline-block; background-color: #FF2A2A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
          <p>Or copy and paste this link into your browser:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `;

      await sendGridEmail({
        to: user.email,
        subject: "Reset your Credit Regulator Pro password",
        html,
      });
    }

    // Always return success to prevent email enumeration
    return new Response(
      JSON.stringify({
        success: true,
        message: "If that email is in our system, we sent a reset link.",
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}