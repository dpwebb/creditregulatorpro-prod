import { OutputType } from "./profile_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Prefer lookup by userId (FK), fall back to email for backwards compatibility
    let userProfile = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!userProfile) {
      console.log(`[profile_GET] No userAccount found by userId=${user.id}, falling back to email lookup`);
      userProfile = await db
        .selectFrom("userAccount")
        .selectAll()
        .where("email", "=", user.email)
        .executeTakeFirst();
    }

    const responseData: OutputType = userProfile
      ? {
          fullName: userProfile.fullName,
          addressLine1: userProfile.addressLine1,
          addressLine2: userProfile.addressLine2,
          city: userProfile.city,
          province: userProfile.province,
          postalCode: userProfile.postalCode,
          dateOfBirth: userProfile.dateOfBirth,
          phone: userProfile.phone,
          email: userProfile.email,
        }
      : {
          fullName: null,
          addressLine1: null,
          addressLine2: null,
          city: null,
          province: null,
          postalCode: null,
          dateOfBirth: null,
          phone: null,
          email: user.email,
        };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof NotAuthenticatedError) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    console.error("Error fetching user profile:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}