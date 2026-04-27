import { schema, OutputType } from "./accept-terms_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    // Authenticate user
    const { user } = await getServerUserSession(request);

    // Parse input (even if empty, ensures conformity)
    const json = await request.json();
    schema.parse(json);

    const now = new Date();

    // Fetch current terms version from system_settings
    const termsVersionSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "terms_version")
      .executeTakeFirst();

    const currentTermsVersion = termsVersionSetting?.value ?? "1.0";
    console.log(`Accepting terms for user ${user.id}, version: ${currentTermsVersion}`);

    // Check if userAccount exists
    const existingAccount = await db
      .selectFrom("userAccount")
      .where("userId", "=", user.id)
      .select("id")
      .executeTakeFirst();

    if (existingAccount) {
      await db
        .updateTable("userAccount")
        .set({
          termsAcceptedAt: now,
          termsAcceptedVersion: currentTermsVersion,
        })
        .where("id", "=", existingAccount.id)
        .execute();
    } else {
      await db
        .insertInto("userAccount")
        .values({
          userId: user.id,
          email: user.email,
          fullName: user.displayName,
          termsAcceptedAt: now,
          termsAcceptedVersion: currentTermsVersion,
        })
        .execute();
    }

    return new Response(
      JSON.stringify({
        success: true,
        termsAcceptedAt: now.toISOString(),
        termsAcceptedVersion: currentTermsVersion,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}