import { schema, OutputType } from "./backfill-source-text_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { NotAuthenticatedError } from "../../helpers/getSetServerSession";
import { parseReport } from "../../helpers/reportParser";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Unauthorized: Admin role required" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 1. Query tradelines that need backfill
    // We join with reportArtifact to get the storageUrl (PDF content)
    // We join with creditor to get the name for matching
    let query = db
      .selectFrom('tradeline')
      .innerJoin('reportArtifact', 'reportArtifact.id', 'tradeline.reportArtifactId')
      .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
      .select([
        'tradeline.id',
        'tradeline.accountNumber',
        'tradeline.sourceText',
        'tradeline.reportArtifactId',
        'reportArtifact.storageUrl',
        'creditor.name as creditorName'
      ])
      .where('tradeline.reportArtifactId', 'is not', null);

    if (input.tradelineId) {
      query = query.where('tradeline.id', '=', input.tradelineId);
    } else if (input.reportArtifactId) {
      query = query.where('tradeline.reportArtifactId', '=', input.reportArtifactId);
    } else {
      // Default mode: only process those missing sourceText
      query = query.where('tradeline.sourceText', 'is', null);
    }

    const tradelinesToProcess = await query.execute();

    if (tradelinesToProcess.length === 0) {
      return new Response(JSON.stringify({ 
        processedCount: 0, 
        updatedCount: 0, 
        errors: [] 
      } satisfies OutputType));
    }

    // Group by artifact to avoid re-parsing the same PDF multiple times
    const tradelinesByArtifact = new Map<number, typeof tradelinesToProcess>();
    for (const tl of tradelinesToProcess) {
      if (tl.reportArtifactId) {
        const list = tradelinesByArtifact.get(tl.reportArtifactId) || [];
        list.push(tl);
        tradelinesByArtifact.set(tl.reportArtifactId, list);
      }
    }

    let processedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    // Process each artifact group
    for (const [artifactId, tradelines] of tradelinesByArtifact.entries()) {
      try {
        // All tradelines in this group share the same artifact storageUrl
        const storageUrl = tradelines[0].storageUrl;
        
        if (!storageUrl) {
          errors.push(`Artifact ${artifactId} has no storageUrl`);
          continue;
        }

        // Parse the report
        // storageUrl contains the base64 PDF content
        const parseResult = await parseReport(storageUrl, 'application/pdf');
        
        if (!parseResult.tradelines || parseResult.tradelines.length === 0) {
          errors.push(`Artifact ${artifactId} parsed but yielded no tradelines`);
          continue;
        }

        // Match and update each tradeline in this group
        for (const dbTradeline of tradelines) {
          processedCount++;
          
          // Find matching parsed tradeline
          const match = parseResult.tradelines.find(parsed => {
            // Normalize account numbers for comparison (digits only to handle masking differences like * vs X)
            const dbAccount = (dbTradeline.accountNumber || '').replace(/[^0-9]/g, '');
            const parsedAccount = (parsed.accountNumber || '').replace(/[^0-9]/g, '');
            
            // Skip if we don't have enough digits to make a safe match
            if (dbAccount.length < 3 || parsedAccount.length < 3) {
              return false;
            }

            // Check account number match (suffix match to handle masking)
            // e.g. DB: 123456, Parsed: ****3456 -> match
            // e.g. DB: ****3456, Parsed: 123456 -> match
            const accountMatch = 
              dbAccount.endsWith(parsedAccount) || parsedAccount.endsWith(dbAccount);

            if (accountMatch) {
              return true;
            }
            
            return false;
          });

          if (match && match.sourceText) {
            await db.updateTable('tradeline')
              .set({ sourceText: match.sourceText })
              .where('id', '=', dbTradeline.id)
              .execute();
            updatedCount++;
          } else {
            // Optional: log missing matches if needed for debugging
            // console.log(`No match found for tradeline ${dbTradeline.id} in artifact ${artifactId}`);
          }
        }

      } catch (err) {
        console.error(`Error processing artifact ${artifactId}:`, err);
        errors.push(`Error processing artifact ${artifactId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return new Response(JSON.stringify({ 
      processedCount, 
      updatedCount, 
      errors 
    } satisfies OutputType));

  } catch (error) {
    return handleEndpointError(error);
  }
}