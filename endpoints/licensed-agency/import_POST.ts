import { schema, OutputType } from "./import_POST.schema";
import { importAgencies } from "../../helpers/licensedAgencyQueries";
import { fetchAndParseOntarioAgencies } from "../../helpers/ontarioOpenDataImporter";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  handleEndpointError,
  BusinessRuleError,
} from "../../helpers/endpointErrorHandler";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      throw new BusinessRuleError("Only administrators can import agency data", 403);
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    let agenciesToImport: Parameters<typeof importAgencies>[0] = [];

    if (input.source === "ontario_open_data") {
      const ontarioRecords = await fetchAndParseOntarioAgencies();
      agenciesToImport = ontarioRecords.map((r) => ({
        agencyName: r.agencyName,
        province: "ON",
        licenseNumber: r.licenseNumber,
        licenseStatus: r.licenseStatus,
        dataSource: "ontario_open_data",
      }));
    } else if (input.source === "manual" && input.agencies) {
      agenciesToImport = input.agencies.map((r) => ({
        agencyName: r.agencyName,
        province: r.province,
        licenseNumber: r.licenseNumber,
        licenseStatus: r.licenseStatus,
        dataSource: "admin_manual",
      }));
    }

    const results = await importAgencies(agenciesToImport);

    return new Response(JSON.stringify(results satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}