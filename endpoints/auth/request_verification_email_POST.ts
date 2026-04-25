import { OutputType } from "./request_verification_email_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { randomUUID } from "crypto";
import { sendGridEmail } from "../../helpers/sendGridEmail";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Rate limiting: 3 requests per hour
    const rateLimit = await checkRateLimit(
      user.id.toString(),
      "VERIFY_EMAIL",
      3,
      60
    );

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        { status: 429 }
      );
    }

    // Generate token using UUID (no nanoid as per guidelines)
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db
      .insertInto("emailVerificationTokens")
      .values({
        userId: user.id,
        token,
        expiresAt,
        verified: false,
      })
      .execute();

        const verifyUrl = `https://www.creditregulatorpro.com/verify-email?token=${token}`;

    const emailHtml = `
      <h1>Verify your email</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verifyUrl}">${verifyUrl}</a>
    `;

    const emailResult = await sendGridEmail({
      to: user.email,
      subject: "Verify your email for Credit Regulator Pro",
      html: emailHtml,
    });

    if (!emailResult.success) {
      console.error("Failed to send verification email:", emailResult.error);
      return new Response(
        JSON.stringify({ error: "Failed to send verification email" }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Verification email sent.",
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}