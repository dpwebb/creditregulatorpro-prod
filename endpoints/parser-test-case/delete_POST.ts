import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import {
  ensureParserTestTrainingArchiveSchema,
  extractParserTestTrainingArchiveItems,
} from "../../helpers/parserTestTrainingArchive";
import { sql } from "kysely";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    await ensureParserTestTrainingArchiveSchema();

    const deleted = await db.transaction().execute(async (trx) => {
      const testCase = await trx
        .selectFrom("parserTestCase")
        .selectAll()
        .where("id", "=", input.id)
        .executeTakeFirst();

      if (!testCase) {
        return {
          testRuns: 0,
          testCases: 0,
          preservedTrainingArtifacts: 0,
        };
      }

      const trainingArtifacts = extractParserTestTrainingArchiveItems(testCase);
      for (const item of trainingArtifacts) {
        await sql`
          insert into public.parser_test_training_archive (
            source_test_case_id,
            source_test_case_name,
            bureau,
            parser_mode,
            stage_version,
            extraction_source,
            training_label,
            training_note,
            training_note_only,
            use_for_training,
            training_payload,
            created_by_admin_id
          )
          values (
            ${item.sourceTestCaseId},
            ${item.sourceTestCaseName},
            ${item.bureau},
            ${item.parserMode},
            ${item.stageVersion},
            ${item.extractionSource},
            ${item.trainingLabel},
            ${item.trainingNote},
            ${item.trainingNoteOnly},
            ${item.useForTraining},
            ${JSON.stringify(item.payload)}::jsonb,
            ${user.id}
          )
        `.execute(trx);
      }

      // Delete generated run/output data first so a test case deletion leaves no stale parser artifacts.
      const runDelete = await trx
        .deleteFrom("parserTestRun")
        .where("testCaseId", "=", input.id)
        .executeTakeFirst();

      const testCaseDelete = await trx
        .deleteFrom("parserTestCase")
        .where("id", "=", input.id)
        .executeTakeFirst();

      return {
        testRuns: Number(runDelete.numDeletedRows ?? 0),
        testCases: Number(testCaseDelete.numDeletedRows ?? 0),
        preservedTrainingArtifacts: trainingArtifacts.length,
      };
    });

    const output: OutputType = {
      success: true,
      deleted,
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
