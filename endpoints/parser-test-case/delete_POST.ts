import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import {
  ensureParserTestTrainingArchiveSchema,
  extractParserTestTrainingArchiveItems,
  getParserTestCaseSourceSha256s,
} from "../../helpers/parserTestTrainingArchive";
import { ensureViolationCorrectionSchema } from "../../helpers/violationCorrectionSchema";
import { sql } from "kysely";
import { deleteReportArtifactCascade } from "../../helpers/deleteReportArtifactCascade";

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
    await ensureViolationCorrectionSchema();

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
          materializedArtifactIds: [] as number[],
          preservedTrainingArtifacts: 0,
          violationCorrections: 0,
          preservedViolationTrainingArtifacts: 0,
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

      const sourceSha256s = getParserTestCaseSourceSha256s(testCase);
      const materializedArtifacts = await trx
        .selectFrom("reportArtifact")
        .select("id")
        .where(sql<boolean>`data->>'source' = 'stage_lab_test_case'`)
        .where(sql<boolean>`data->>'parserTestCaseId' = ${String(testCase.id)}`)
        .execute();
      const linkedArtifactIds = materializedArtifacts.map((artifact) => artifact.id);
      const linkedRuns =
        linkedArtifactIds.length > 0
          ? await trx
              .selectFrom("passExtraction")
              .select("id")
              .where("reportArtifactId", "in", linkedArtifactIds)
              .execute()
          : [];
      const directlyLinkedTradelines =
        linkedArtifactIds.length > 0
          ? await trx
              .selectFrom("tradeline")
              .select("id")
              .where("reportArtifactId", "in", linkedArtifactIds)
              .execute()
          : [];
      const presenceLinkedTradelines =
        linkedArtifactIds.length > 0
          ? await trx
              .selectFrom("tradelineArtifactPresence")
              .select("tradelineId as id")
              .where("reportArtifactId", "in", linkedArtifactIds)
              .execute()
          : [];
      const linkedRunIds = linkedRuns.map((run) => run.id);
      const linkedTradelineIds = Array.from(
        new Set([
          ...directlyLinkedTradelines.map((tradeline) => tradeline.id),
          ...presenceLinkedTradelines.map((tradeline) => tradeline.id),
        ]),
      );

      let linkedCorrections: any[] = [];
      if (linkedRunIds.length > 0 || linkedTradelineIds.length > 0) {
        let correctionQuery = trx.selectFrom("violationCorrection").selectAll();
        if (linkedRunIds.length > 0 && linkedTradelineIds.length > 0) {
          correctionQuery = correctionQuery.where((eb) =>
            eb.or([
              eb("extractionRunId", "in", linkedRunIds),
              eb("tradelineId", "in", linkedTradelineIds),
            ]),
          );
        } else if (linkedRunIds.length > 0) {
          correctionQuery = correctionQuery.where("extractionRunId", "in", linkedRunIds);
        } else {
          correctionQuery = correctionQuery.where("tradelineId", "in", linkedTradelineIds);
        }
        linkedCorrections = await correctionQuery.execute();
      }

      const linkedCorrectionIds = linkedCorrections.map((correction) => correction.id);
      const [evidenceRows, referenceRows, trainingRows] =
        linkedCorrectionIds.length > 0
          ? await Promise.all([
              trx
                .selectFrom("violationCorrectionEvidence")
                .selectAll()
                .where("correctionId", "in", linkedCorrectionIds)
                .execute(),
              trx
                .selectFrom("violationRegulationReference")
                .selectAll()
                .where("correctionId", "in", linkedCorrectionIds)
                .execute(),
              trx
                .selectFrom("violationTrainingExample")
                .selectAll()
                .where("correctionId", "in", linkedCorrectionIds)
                .execute(),
            ])
          : [[], [], []];

      const rowsByCorrection = <T extends { correctionId: number }>(rows: T[]) => {
        const map = new Map<number, T[]>();
        for (const row of rows) {
          map.set(row.correctionId, [...(map.get(row.correctionId) ?? []), row]);
        }
        return map;
      };

      const evidenceByCorrection = rowsByCorrection(evidenceRows);
      const referencesByCorrection = rowsByCorrection(
        referenceRows.filter((row) => row.correctionId != null) as Array<typeof referenceRows[number] & { correctionId: number }>,
      );
      const trainingByCorrection = rowsByCorrection(trainingRows);
      const trainingCorrections = linkedCorrections.filter(
        (correction) => correction.useForTraining === true || correction.trainingNoteOnly === true,
      );

      for (const correction of trainingCorrections) {
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
            ${testCase.id},
            ${testCase.name},
            ${testCase.bureau},
            ${testCase.parserMode},
            ${testCase.stageVersion},
            ${testCase.extractionSource},
            ${correction.trainingLabel},
            ${correction.adminNotes ?? correction.correctionReason},
            ${correction.trainingNoteOnly},
            ${correction.useForTraining},
            ${JSON.stringify({
              source: "violation_correction_delete",
              sourceTestCase: {
                id: testCase.id,
                name: testCase.name,
                bureau: testCase.bureau,
                parserMode: testCase.parserMode,
                stageVersion: testCase.stageVersion,
                extractionSource: testCase.extractionSource,
              },
              linkedSourceSha256s: sourceSha256s,
              correction,
              evidence: evidenceByCorrection.get(correction.id) ?? [],
              regulationReferences: referencesByCorrection.get(correction.id) ?? [],
              trainingExamples: trainingByCorrection.get(correction.id) ?? [],
            })}::jsonb,
            ${user.id}
          )
        `.execute(trx);
      }

      if (linkedCorrectionIds.length > 0) {
        await trx
          .deleteFrom("violationTrainingExample")
          .where("correctionId", "in", linkedCorrectionIds)
          .execute();
        await trx
          .deleteFrom("violationRegulationReference")
          .where("correctionId", "in", linkedCorrectionIds)
          .execute();
        await trx
          .deleteFrom("violationCorrectionEvidence")
          .where("correctionId", "in", linkedCorrectionIds)
          .execute();
        await trx
          .deleteFrom("violationCorrection")
          .where("id", "in", linkedCorrectionIds)
          .execute();
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
        materializedArtifactIds: linkedArtifactIds,
        preservedTrainingArtifacts: trainingArtifacts.length,
        violationCorrections: linkedCorrections.length,
        preservedViolationTrainingArtifacts: trainingCorrections.length,
      };
    });

    let materializedArtifacts = 0;
    for (const artifactId of deleted.materializedArtifactIds) {
      await deleteReportArtifactCascade(artifactId, user.id, request);
      materializedArtifacts += 1;
    }

    const output: OutputType = {
      success: true,
      deleted: {
        testRuns: deleted.testRuns,
        testCases: deleted.testCases,
        materializedArtifacts,
        preservedTrainingArtifacts: deleted.preservedTrainingArtifacts,
        violationCorrections: deleted.violationCorrections,
        preservedViolationTrainingArtifacts: deleted.preservedViolationTrainingArtifacts,
      },
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
