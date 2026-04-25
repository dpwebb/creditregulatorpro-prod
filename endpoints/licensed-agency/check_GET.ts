import { schema, OutputType } from "./check_GET.schema";
import { findLicensedAgency } from "../../helpers/licensedAgencyQueries";
import { getRegistryLookupUrl } from "../../helpers/collectionAgencyRegistry";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { CanadianProvince } from "../../helpers/schema";


export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    const url = new URL(request.url);
    const input = schema.parse({
      agencyName: url.searchParams.get("agencyName"),
      province: url.searchParams.get("province"),
    });

    const provinceCode = input.province.toUpperCase() as CanadianProvince;
    const agency = await findLicensedAgency(input.agencyName, provinceCode);
    const registryUrl = getRegistryLookupUrl(provinceCode);

    return new Response(
      JSON.stringify({
        found: !!agency,
        agency: agency || null,
        registryUrl,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}