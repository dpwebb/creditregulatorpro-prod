import { schema, OutputType } from "./seed_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { seedStatutes } from "../../helpers/statuteSeed";
import { seedBureaus } from "../../helpers/bureauSeed";
import { seedCreditorValidations } from "../../helpers/creditorValidationSeed";
import { seedFederalGuidance } from "../../helpers/federalGuidanceSeed";
import { seedIndustryStandards } from "../../helpers/industryStandardSeed";
import { seedSpecializedDebtRules } from "../../helpers/specializedDebtRulesSeed";
import { seedBankruptcyRecords } from "../../helpers/bankruptcySeed";
import { disclosureRequirementSeed } from "../../helpers/disclosureRequirementSeed";


export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Admin-only endpoint
    if (user.role !== 'admin') {
      console.warn(`Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role}) on ${request.url}`);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    schema.parse(json);

    // Execute seeds
    // We run them sequentially to avoid any potential connection pool exhaustion if they were massive,
    // though here they are small.
    await seedStatutes(db);
    await disclosureRequirementSeed(db);
    await seedBureaus(db);
    await seedCreditorValidations(db);
    await seedFederalGuidance(db);
    await seedIndustryStandards(db);
    await seedSpecializedDebtRules(db);
    await seedBankruptcyRecords(db);

    return new Response(
      JSON.stringify({ ok: true } satisfies OutputType),
    );
    } catch (error) {
    return handleEndpointError(error);
  }
}