import { schema, OutputType } from "./scan_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { scanForRegulatoryUpdates } from "../../helpers/regulatoryScanner";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
    }

    // Parse to ensure valid input even though schema is empty
    const json = await request.text();
    schema.parse(json ? JSON.parse(json) : {});

    // 1. Fetch existing titles to avoid duplication
    const existingRecords = await db
      .selectFrom("regulatoryUpdateLog")
      .select("title")
      .execute();
    
    const existingTitles = existingRecords.map(r => r.title);

    // 2. Scan for updates using Gemini
    const scannedUpdates = await scanForRegulatoryUpdates(existingTitles);

    let insertedCount = 0;

    // 3. Insert valid results into the database
    if (scannedUpdates.length > 0) {
      const valuesToInsert = scannedUpdates.map(update => ({
        title: update.title,
        description: update.description,
        jurisdiction: update.jurisdiction,
        changeType: update.changeType,
        source: update.source,
        statutoryReference: update.statutoryReference,
        effectiveDate: update.effectiveDate ? new Date(update.effectiveDate) : null,
        sourceUrl: update.sourceUrl,
        impactAssessment: update.impactAssessment,
        actionRequired: update.actionRequired,
        status: "DETECTED" as const,
        region: "CA",
        detectedAt: new Date(),
      }));

      const inserted = await db
        .insertInto("regulatoryUpdateLog")
        .values(valuesToInsert)
        .returning("id")
        .execute();

      insertedCount = inserted.length;
    }

    return new Response(
      JSON.stringify({ 
        inserted: insertedCount, 
        scanned: scannedUpdates 
      } satisfies OutputType),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error in regulatory-update/scan_POST:", error);
    return handleEndpointError(error);
  }
}