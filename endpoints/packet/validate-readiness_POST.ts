import { schema, OutputType } from "./validate-readiness_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";


const CANADIAN_POSTAL_CODE_REGEX = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export async function handle(request: Request) {
  try {
    // 1. Authenticate user
    const { user } = await getServerUserSession(request);

    // Parse input
    const json = JSON.parse(await request.text());
    const { tradelineId } = schema.parse(json);

    // 2. Query user_account table.
    // Prefer userId linkage; keep an email fallback for legacy rows where userId is null.
    let userAccount = await db
      .selectFrom("userAccount")
      .where("userId", "=", user.id)
      .selectAll()
      .executeTakeFirst();

    if (!userAccount) {
      userAccount = await db
        .selectFrom("userAccount")
        .where("email", "=", user.email)
        .selectAll()
        .executeTakeFirst();
    }

    const missingUserFields: string[] = [];

    if (!userAccount) {
      // If no profile exists, all required fields are missing
      missingUserFields.push(
        "fullName",
        "addressLine1",
        "city",
        "province",
        "postalCode"
      );
    } else {
      if (!userAccount.fullName?.trim()) missingUserFields.push("fullName");
      if (!userAccount.addressLine1?.trim())
        missingUserFields.push("addressLine1");
      if (!userAccount.city?.trim()) missingUserFields.push("city");
      if (!userAccount.province?.trim()) missingUserFields.push("province");

      const postalCode = userAccount.postalCode?.trim();
      if (!postalCode) {
        missingUserFields.push("postalCode");
      } else if (!CANADIAN_POSTAL_CODE_REGEX.test(postalCode)) {
        // If present but invalid, we consider it missing/invalid
        missingUserFields.push("postalCode");
      }
    }

    // 3. Query tradeline table
    const tradeline = await db
      .selectFrom("tradeline")
      .where("id", "=", tradelineId)
      .select(["userId", "bureauId"])
      .executeTakeFirst();

    if (!tradeline) {
      return new Response(
        JSON.stringify({ error: "Tradeline not found" }),
        { status: 404 }
      );
    }

        // Authorization check: Admins can validate any tradeline, users only their own
    if (user.role !== "admin" && tradeline.userId !== user.id) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized access to this tradeline",
        }),
        { status: 403 }
      );
    }

    // 4. Query bureau table
    let missingBureauInfo = true;
    let bureauName: string | null = null;

    if (tradeline.bureauId) {
      const bureau = await db
        .selectFrom("bureau")
        .where("id", "=", tradeline.bureauId)
        .selectAll()
        .executeTakeFirst();

      if (bureau) {
        bureauName = bureau.name;
        const hasFullAddressString = !!bureau.address?.trim();
        const hasStructuredAddress =
          !!bureau.addressLine1?.trim() &&
          !!bureau.city?.trim() &&
          !!bureau.province?.trim() &&
          !!bureau.postalCode?.trim();

        if (hasFullAddressString || hasStructuredAddress) {
          missingBureauInfo = false;
        }
      }
    }

    // 5. Return validation results
    const isReady = missingUserFields.length === 0 && !missingBureauInfo;

    return new Response(
      JSON.stringify({
        isReady,
        missingUserFields,
        missingBureauInfo,
        bureauName,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
