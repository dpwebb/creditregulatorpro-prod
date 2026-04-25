import { schema, OutputType } from "./profile_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Prefer lookup by userId (FK), fall back to email for backwards compatibility
    let existingProfile = await db
      .selectFrom("userAccount")
      .select(["id", "userId"])
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!existingProfile) {
      console.log(`[profile_POST] No userAccount found by userId=${user.id}, falling back to email lookup`);
      existingProfile = await db
        .selectFrom("userAccount")
        .select(["id", "userId"])
        .where("email", "=", user.email)
        .executeTakeFirst();
    }

    let updatedProfile;

    if (existingProfile) {
      // Build the update payload
      const updatePayload: Record<string, unknown> = {
        fullName: input.fullName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        province: input.province,
        postalCode: input.postalCode,
        dateOfBirth: input.dateOfBirth ?? null,
        phone: input.phone ?? null,
      };

      // If the existing profile lacks a userId (found by email fallback), backfill it
      if (existingProfile.userId === null || existingProfile.userId === undefined) {
        console.log(`[profile_POST] Backfilling userId=${user.id} on userAccount id=${existingProfile.id}`);
        updatePayload.userId = user.id;
      }

      updatedProfile = await db
        .updateTable("userAccount")
        .set(updatePayload)
        .where("id", "=", existingProfile.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } else {
      // Create new profile, including userId FK
      updatedProfile = await db
        .insertInto("userAccount")
        .values({
          email: user.email,
          userId: user.id,
          fullName: input.fullName,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          city: input.city,
          province: input.province,
          postalCode: input.postalCode,
          dateOfBirth: input.dateOfBirth ?? null,
          phone: input.phone ?? null,
          region: "CA", // Enforce CA region policy for new records
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const responseData: OutputType = {
      fullName: updatedProfile.fullName,
      addressLine1: updatedProfile.addressLine1,
      addressLine2: updatedProfile.addressLine2,
      city: updatedProfile.city,
      province: updatedProfile.province,
      postalCode: updatedProfile.postalCode,
      dateOfBirth: updatedProfile.dateOfBirth,
      phone: updatedProfile.phone,
      email: updatedProfile.email,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}