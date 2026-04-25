import { schema, OutputType } from "./verify_email_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
// handleEndpointError already imported above

export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const tokenRecord = await db
      .selectFrom("emailVerificationTokens")
      .selectAll()
      .where("token", "=", result.token)
      .executeTakeFirst();

    if (!tokenRecord) {
      return new Response(
        JSON.stringify({ error: "Invalid verification token." }),
        { status: 400 }
      );
    }

    if (tokenRecord.verified) {
      return new Response(
        JSON.stringify({ error: "Email is already verified." }),
        { status: 400 }
      );
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      return new Response(
        JSON.stringify({ error: "Verification token has expired." }),
        { status: 400 }
      );
    }

    // Mark as verified and update user
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("emailVerificationTokens")
        .set({ verified: true })
        .where("id", "=", tokenRecord.id)
        .execute();

      await trx
        .updateTable("users")
        .set({ emailVerified: true })
        .where("id", "=", tokenRecord.userId)
        .execute();
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email successfully verified.",
      } satisfies OutputType)
    );
  } catch (error) {
    console.error("verify_email error:", error);
    return handleEndpointError(error);
  }
}