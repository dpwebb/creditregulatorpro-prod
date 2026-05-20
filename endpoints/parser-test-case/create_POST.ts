import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./create_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json } from "../../helpers/schema";
import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { createReportArtifact } from "../../helpers/ingestArtifactCreator";
import { handleIngestProcess } from "../../helpers/ingestReportHandler";
import type { ResolvedUserSession } from "../../helpers/ingestSessionResolver";
import type { SSEEvent } from "../../helpers/sseStreamBuilder";
import {
  isUploadRequestContentLengthTooLarge,
  isUploadRequestTextTooLarge,
  PARSER_TEST_CASE_UPLOAD_MAX_BYTES,
  uploadRequestTooLargeResponse,
} from "../../helpers/uploadPayloadValidation";

async function resolveAdminUserAccount(user: ResolvedUserSession["user"]): Promise<ResolvedUserSession["userAccount"]> {
  let userAccount = await db
    .selectFrom("userAccount")
    .selectAll()
    .where("userId", "=", user.id)
    .executeTakeFirst();

  if (!userAccount) {
    userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("email", "=", user.email)
      .executeTakeFirst();
  }

  if (!userAccount) {
    userAccount = await db
      .insertInto("userAccount")
      .values({
        userId: user.id,
        email: user.email,
        fullName: user.displayName,
        region: "CA",
        role: user.role,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return userAccount;
}

async function materializeStageLabForViolationCorrections(params: {
  user: ResolvedUserSession["user"];
  userAccount: ResolvedUserSession["userAccount"];
  testCaseId: number;
  testCaseName: string;
  bytesBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<number> {
  const region = params.userAccount.region ?? "CA";
  const artifact = await createReportArtifact({
    userId: params.user.id,
    organizationId: params.user.organizationId ?? null,
    bytesBase64: params.bytesBase64,
    fileName: params.fileName,
    mimeType: params.mimeType,
    region,
  });

  const artifactData = (await db
    .selectFrom("reportArtifact")
    .select("data")
    .where("id", "=", artifact.artifactId)
    .executeTakeFirst())?.data as Record<string, unknown> ?? {};

  await db
    .updateTable("reportArtifact")
    .set({
      data: JSON.parse(JSON.stringify({
        ...artifactData,
        source: "stage_lab_test_case",
        parserTestCaseId: params.testCaseId,
        parserTestCaseName: params.testCaseName,
        extractionStatus: "ready",
        extractionSource: "pending",
        extractionProvenance: {
          strategy: "stage_lab_materialized_ingestion",
          source: "parser_test_case_create",
          artifactSha256: artifact.sha256,
        },
      })) as Json,
    })
    .where("id", "=", artifact.artifactId)
    .execute();

  const events: SSEEvent[] = [];
  await handleIngestProcess(
    {
      user: params.user,
      isAuthenticatedUpload: true,
      userAccount: params.userAccount,
    },
    artifact.artifactId,
    (event) => events.push(event),
  );

  const errorEvent = events.find((event) => event.type === "error");
  if (errorEvent?.type === "error") {
    throw new Error(errorEvent.error || "Stage Lab materialization failed.");
  }

  return artifact.artifactId;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }

    if (isUploadRequestContentLengthTooLarge(request, PARSER_TEST_CASE_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Parser test PDF", PARSER_TEST_CASE_UPLOAD_MAX_BYTES);
    }

    const text = await request.text();
    if (isUploadRequestTextTooLarge(text, PARSER_TEST_CASE_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Parser test PDF", PARSER_TEST_CASE_UPLOAD_MAX_BYTES);
    }

    const json = JSON.parse(text);
    const input = schema.parse(json);
    await ensureParserTestAdjudicationSchema();

    const inputParserContext =
      input.parserContext && typeof input.parserContext === "object" && !Array.isArray(input.parserContext)
        ? (input.parserContext as Record<string, unknown>)
        : {};
    const hasCanonicalContext =
      Boolean(inputParserContext.canonicalOutput) && Boolean(inputParserContext.replayHash);
    const needsParserFallback =
      input.expectedConsumerInfo === undefined ||
      input.expectedTradelines === undefined ||
      input.rawExtractedText === undefined ||
      !hasCanonicalContext;
    const parserFallback = needsParserFallback
      ? await parsePdfThroughProductionHtmlPipeline(input.pdfBase64, {
          allowAiFallback: false,
          parserMode: "deterministic",
        })
      : null;

    const expectedConsumerInfo =
      input.expectedConsumerInfo !== undefined
        ? input.expectedConsumerInfo
        : parserFallback?.parseResult.consumerInfo ?? null;
    const expectedTradelines =
      input.expectedTradelines !== undefined
        ? input.expectedTradelines
        : parserFallback?.parseResult.tradelines ?? null;
    const rawExtractedText =
      input.rawExtractedText !== undefined
        ? input.rawExtractedText
        : parserFallback?.rawExtractedText ?? null;
    const parserContext = {
      ...inputParserContext,
      ...(parserFallback?.parserPipelineAudit ? { pipelineAudit: parserFallback.parserPipelineAudit } : {}),
      ...(parserFallback?.canonicalOutput ? { canonicalOutput: parserFallback.canonicalOutput } : {}),
      ...(parserFallback?.replayHash ? { replayHash: parserFallback.replayHash } : {}),
      ...(parserFallback?.replayValidation ? { replayValidation: parserFallback.replayValidation } : {}),
    };

    // 3. Create test case
    const newTestCase = await db
      .insertInto("parserTestCase")
      .values({
        name: input.name,
        description: input.description,
        pdfBase64: input.pdfBase64,
        rawExtractedText,
        expectedConsumerInfo: expectedConsumerInfo as unknown as Json,
        expectedTradelines: expectedTradelines as unknown as Json,
        bureau: input.bureau ?? null,
        parserMode: "deterministic",
        allowAiFallback: false,
        stageVersion: input.stageVersion ?? null,
        extractionSource: input.extractionSource ?? null,
        parserContext: parserContext as unknown as Json,
        adminReviewStatus: "needs_review",
        approvedConsumerInfo: null,
        approvedTradelines: [],
        adjudicationDecisions: [],
        createdBy: user.id,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    let materializedArtifactId: number | null = null;
    if (input.materializeForViolationCorrections) {
      const userAccount = await resolveAdminUserAccount(user);
      materializedArtifactId = await materializeStageLabForViolationCorrections({
        user,
        userAccount,
        testCaseId: newTestCase.id,
        testCaseName: newTestCase.name,
        bytesBase64: input.pdfBase64,
        fileName: String((inputParserContext as any).sourceFileName || `${input.name}.pdf`),
        mimeType: "application/pdf",
      });
    }

    const output: OutputType = {
      testCase: {
        id: newTestCase.id,
        name: newTestCase.name,
        description: newTestCase.description,
        expectedConsumerInfo: newTestCase.expectedConsumerInfo,
        expectedTradelines: newTestCase.expectedTradelines,
        rawExtractedText: newTestCase.rawExtractedText,
        bureau: newTestCase.bureau,
        parserMode: newTestCase.parserMode,
        allowAiFallback: newTestCase.allowAiFallback,
        stageVersion: newTestCase.stageVersion,
        extractionSource: newTestCase.extractionSource,
        parserContext: newTestCase.parserContext,
        adminReviewStatus: newTestCase.adminReviewStatus,
        materializedArtifactId,
      },
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
