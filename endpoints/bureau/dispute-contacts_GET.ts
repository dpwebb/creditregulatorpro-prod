import { OutputType } from "./dispute-contacts_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getBureauDisputeAddress } from "../../helpers/bureauDisputeAddresses";

export async function handle(request: Request) {
  try {
    // Ensure user is authenticated
    await getServerUserSession(request);

    // Fetch all bureaus
    const bureaus = await db
      .selectFrom('bureau')
      .select(['id', 'name', 'contactEmail', 'contactPhone'])
      .orderBy('name', 'asc')
      .execute();

    // Map bureaus to include the official dispute address from the helper
    const bureausWithAddresses = bureaus.map((bureau) => {
      const officialAddress = getBureauDisputeAddress(bureau.name);
      
      return {
        id: bureau.id,
        name: bureau.name,
        contactEmail: bureau.contactEmail,
        contactPhone: bureau.contactPhone,
        disputeAddress: officialAddress ? {
          name: officialAddress.bureauName,
          department: officialAddress.department,
          addressLine1: officialAddress.addressLine1,
          city: officialAddress.city,
          province: officialAddress.province,
          postalCode: officialAddress.postalCode,
          email: officialAddress.email,
          onlineDisputeUrl: officialAddress.onlineDisputeUrl,
        } : null
      };
    });

    return new Response(JSON.stringify({ bureaus: bureausWithAddresses } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}