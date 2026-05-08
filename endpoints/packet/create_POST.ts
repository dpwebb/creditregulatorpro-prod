import { schema, OutputType, PreviewPacket } from "./create_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generatePDF } from "../../helpers/pdfGenerator";
import { uploadPdf } from "../../helpers/documentStorage";
import { packetDataResolver } from "../../helpers/packetDataResolver";
import { packetLetterBuilder } from "../../helpers/packetLetterBuilder";
import { packetEvidenceCreator } from "../../helpers/packetEvidenceCreator";
import { mapViolationToDisputeReason, type EquifaxDisputeReasonCode, type StatuteInfo } from "../../helpers/equifaxDisputeReasons";
import { letterHumanizer } from "../../helpers/letterHumanizer";
import { logPacketGenerated } from "../../helpers/auditLogger";
import { ensureUserSignature } from "../../helpers/signatureGenerator";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { assertCreditorObligationPacketReady } from "../../helpers/packetViolationConfidenceGuard";

/** Returns true if all required third-party recipient fields are present and non-empty. */
function hasThirdPartyRecipient(input: {
  recipientName?: string;
  recipientAddressLine1?: string;
  recipientCity?: string;
  recipientProvince?: string;
  recipientPostalCode?: string;
}): boolean {
  return (
    !!input.recipientName?.trim() &&
    !!input.recipientAddressLine1?.trim() &&
    !!input.recipientCity?.trim() &&
    !!input.recipientProvince?.trim() &&
    !!input.recipientPostalCode?.trim()
  );
}

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Skip rate limiting for previews — they are cheaper and don't persist data
    if (!input.preview) {
      const rateLimitResult = await checkRateLimit(
        user.id.toString(),
        "PACKET_CREATE",
        RateLimitConfig.PACKET_CREATE.maxAttempts,
        RateLimitConfig.PACKET_CREATE.windowMinutes
      );
      if (!rateLimitResult.allowed) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Early validation: non-preview requests must have either a bureauId OR complete third-party recipient fields
    if (!input.preview) {
      if (!input.tradelineId) {
        throw new BusinessRuleError("tradelineId is required to create a packet.", 400);
      }

      const hasThirdParty = hasThirdPartyRecipient(input);
      if (!input.bureauId && !hasThirdParty) {
        throw new BusinessRuleError(
          "Either bureauId or full third-party recipient details (recipientName, recipientAddressLine1, recipientCity, recipientProvince, recipientPostalCode) are required to create a packet.",
          400
        );
      }

      // Duplicate draft check: prevent creating a second draft for the same tradeline/bureau/violation
      if (input.bureauId) {
        const existingDraft = await db
          .selectFrom("packet")
          .select("id")
          .where("userId", "=", user.id)
          .where("tradelineId", "=", input.tradelineId)
          .where("bureauId", "=", input.bureauId)
          .where((eb) =>
            input.creditorObligationTestId != null
              ? eb("creditorObligationTestId", "=", input.creditorObligationTestId)
              : eb("creditorObligationTestId", "is", null)
          )
          .where("status", "=", "Draft")
          .executeTakeFirst();

        if (existingDraft) {
          console.log(`Duplicate draft detected for user ${user.id}, tradeline ${input.tradelineId}, bureau ${input.bureauId}, creditorObligationTestId ${input.creditorObligationTestId ?? null}`);
          return new Response(
            JSON.stringify({ error: "A draft dispute letter already exists for this tradeline and violation." }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    const isAdmin = user.role === "admin";
    await assertCreditorObligationPacketReady({
      creditorObligationTestId: input.creditorObligationTestId,
      tradelineId: input.tradelineId,
      userId: user.id,
      isAdmin,
    });

    // Fetch user account information for consumer details
    let userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!userAccount) {
      // Fallback to email lookup for backwards compatibility
      userAccount = await db
        .selectFrom("userAccount")
        .selectAll()
        .where("email", "=", user.email)
        .executeTakeFirst();
    }

    if (!userAccount) {
      throw new Error("User account not found. Please complete your profile before generating packets.");
    }

    // Validate required consumer information
    const missingFields: string[] = [];
    if (!userAccount.fullName) missingFields.push("fullName");
    if (!userAccount.addressLine1) missingFields.push("addressLine1");
    if (!userAccount.city) missingFields.push("city");
    if (!userAccount.province) missingFields.push("province");
    if (!userAccount.postalCode) missingFields.push("postalCode");

    if (missingFields.length > 0) {
      return new Response(JSON.stringify({
        error: "Incomplete consumer profile. Please complete your profile before generating packets.",
        missingFields
      }), { status: 400 });
    }

    // At this point, all required fields are guaranteed to be non-null
    const validatedName = userAccount.fullName!;
    const validatedAddressLine1 = userAccount.addressLine1!;
    const validatedCity = userAccount.city!;
    const validatedProvince = userAccount.province!;
    const validatedPostalCode = userAccount.postalCode!;

    // Build consumer address array
    const consumerAddress: string[] = [validatedAddressLine1];
    if (userAccount.addressLine2) {
      consumerAddress.push(userAccount.addressLine2);
    }
    consumerAddress.push(`${validatedCity}, ${validatedProvince} ${validatedPostalCode}`);

    // Format consumer DOB
    let consumerDOB: string | undefined;
    if (userAccount.dateOfBirth) {
      consumerDOB = new Date(userAccount.dateOfBirth).toLocaleDateString("en-CA");
    }

    // Look up the relevant statute for the user's province from the database.
    const statuteRecord = await db
      .selectFrom("statute")
      .innerJoin("statuteVersion", "statuteVersion.statuteId", "statute.id")
      .select([
        "statute.code",
        "statuteVersion.sectionReference",
        "statuteVersion.description",
        "statuteVersion.sourceUrl",
      ])
      .where("statute.jurisdiction", "=", validatedProvince)
      .where("statuteVersion.supersededDate", "is", null)
      .orderBy("statute.code", "asc")
      .executeTakeFirst();

    const statuteInfo: StatuteInfo | undefined = statuteRecord
      ? {
          code: statuteRecord.code,
          sectionReference: statuteRecord.sectionReference ?? "",
          description: statuteRecord.description ?? "",
          sourceUrl: statuteRecord.sourceUrl ?? undefined,
        }
      : undefined;

    if (statuteInfo) {
      console.log(`Resolved statute for province "${validatedProvince}": ${statuteInfo.code} — ${statuteInfo.description}, ${statuteInfo.sectionReference}`);
    } else {
      console.log(`No statute record found for province "${validatedProvince}" — will use hardcoded fallback`);
    }

    // Resolve all tradeline, violation, and bureau data via helper
    const resolvedData = await packetDataResolver({
      user,
      tradelineId: input.tradelineId,
      bureauId: input.bureauId,
      creditorObligationTestId: input.creditorObligationTestId,
      isAdmin,
      thirdPartyRecipient: {
        recipientName: input.recipientName,
        recipientAddressLine1: input.recipientAddressLine1,
        recipientAddressLine2: input.recipientAddressLine2,
        recipientCity: input.recipientCity,
        recipientProvince: input.recipientProvince,
        recipientPostalCode: input.recipientPostalCode,
      },
    });

    const {
      accountNumber,
      creditorName,
      terminalLabel,
      tradelineDetails,
      violationDetails,
      recipientName,
      recipientAddress,
      bureauNameRaw,
      transunionCaseId,
    } = resolvedData;

    // Determine the dispute reason code: prefer explicit input, fall back to mapping from violationCategory
    const effectiveViolationCategory = input.violationCategory ?? violationDetails?.violationCategory ?? null;
    const violationTechnicalDetails = violationDetails?.technicalDetails ?? {};
    const resolvedDisputeReasonCode: EquifaxDisputeReasonCode =
      (input.disputeReasonCode as EquifaxDisputeReasonCode | null | undefined) ||
      mapViolationToDisputeReason(
        effectiveViolationCategory,
        violationDetails
          ? {
              fieldName: violationDetails.fieldName ?? undefined,
              ruleName:
                violationTechnicalDetails.ruleName != null
                  ? String(violationTechnicalDetails.ruleName)
                  : undefined,
              ruleCategory:
                violationTechnicalDetails.ruleCategory != null
                  ? String(violationTechnicalDetails.ruleCategory)
                  : undefined,
            }
          : undefined
      );

    console.log(`Resolved dispute reason code: ${resolvedDisputeReasonCode} (explicit: ${input.disputeReasonCode ?? 'none'}, violation: ${effectiveViolationCategory ?? 'none'})`);

    // Build letter content via helper (handles Equifax, TransUnion, and generic fallback)
    let letterContent = await packetLetterBuilder({
      bureauNameRaw,
      consumerName: validatedName,
      consumerAddress,
      consumerDOB,
      consumerPhone: userAccount.phone ?? undefined,
      consumerEmail: userAccount.email ?? undefined,
      creditorName,
      accountNumber,
      transunionCaseId,
      tradelineDetails,
      violationDetails,
      effectiveViolationCategory,
      disputeReasonCode: resolvedDisputeReasonCode,
      statuteInfo,
      terminalLabel,
      province: validatedProvince,
      additionalNotes: input.content ?? undefined,
      recipientName,
      recipientAddress,
    });

    // Humanize the letter content via OpenAI before generating the PDF
    letterContent = await letterHumanizer(letterContent);
    console.log("Letter humanized via OpenAI gpt-5-mini");

    // Attach user's digital signature to the letter
    const signatureImage = await ensureUserSignature(user.id);
    if (signatureImage) {
      letterContent.signatureImage = signatureImage;
    }
    console.log(`Digital signature attached for user ${user.id}`);

    const contentJson = JSON.stringify(letterContent);
    const now = new Date();

    if (input.preview) {
      // Preview mode: generate PDF but do NOT insert into DB; return a transient preview object with raw base64 for local display
      console.log(`Generating PDF for packet (preview=true) with calculated terminal label: ${terminalLabel}`);
      const pdfBase64 = await generatePDF(letterContent, user.id.toString(), "preview");
      console.log(`Preview mode — skipping DB insert and GCS upload, returning preview packet`);
      // Resolve recipient fields: prefer third-party input fields, fall back to resolved bureau recipient
      const resolvedRecipientAddressParts = recipientAddress ?? [];
      const previewPacket: PreviewPacket = {
        id: null,
        tradelineId: input.tradelineId ?? null,
        bureauId: input.bureauId ?? null,
        status: input.status ?? null,
        terminalLabel: terminalLabel ?? null,
        content: contentJson,
        pdfStorageUrl: pdfBase64,
        creditorObligationTestId: input.creditorObligationTestId ?? null,
        region: 'CA',
        createdAt: now,
        letterDate: now,
        userId: user.id,
        organizationId: null,
        sentDate: null,
        bureauResponseDate: null,
        consumerCertification: null,
        deliveryMethod: null,
        pdfStorageUrl_: null,
        responseType: null,
        signatureMode: null,
        statuteVersionId: null,
        successOutcome: null,
        trackingNumber: null,
        type: null,
        recipientName: input.recipientName ?? recipientName ?? null,
        recipientAddressLine1: input.recipientAddressLine1 ?? resolvedRecipientAddressParts[0] ?? null,
        recipientAddressLine2: input.recipientAddressLine2 ?? resolvedRecipientAddressParts[1] ?? null,
        recipientCity: input.recipientCity ?? null,
        recipientProvince: input.recipientProvince ?? null,
        recipientPostalCode: input.recipientPostalCode ?? null,
      };
      return new Response(JSON.stringify({ packet: previewPacket } satisfies OutputType));
    }

    // Step 1: Insert packet with processingStatus 'pending' to reserve the record
    console.log(`Inserting packet record with processingStatus='pending' for user ${user.id}`);
    const newPacket = await db
      .insertInto('packet')
      .values({
        tradelineId: input.tradelineId,
        bureauId: input.bureauId ?? null,
        status: input.status,
        terminalLabel,
        content: contentJson,
        pdfStorageUrl: null,
        userId: user.id,
        letterDate: now,
        createdAt: now,
        region: 'CA',
        creditorObligationTestId: input.creditorObligationTestId,
        processingStatus: 'pending',
        recipientName: input.recipientName ?? null,
        recipientAddressLine1: input.recipientAddressLine1 ?? null,
        recipientAddressLine2: input.recipientAddressLine2 ?? null,
        recipientCity: input.recipientCity ?? null,
        recipientProvince: input.recipientProvince ?? null,
        recipientPostalCode: input.recipientPostalCode ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    console.log(`Packet created with ID ${newPacket.id}, beginning PDF generation pipeline`);

    // Steps 2-5: PDF generation, GCS upload, evidence creation — wrap in try/catch to mark as failed on error
    try {
      // Step 2: Mark as 'generating' before PDF generation
      await db
        .updateTable('packet')
        .set({ processingStatus: 'generating' })
        .where('id', '=', newPacket.id)
        .execute();

      console.log(`Generating PDF for packet ${newPacket.id} with terminal label: ${terminalLabel}`);
      const pdfBase64WithId = await generatePDF(letterContent, user.id.toString(), newPacket.id.toString());

      // Step 3: Mark as 'uploading' before PDF storage
      await db
        .updateTable('packet')
        .set({ processingStatus: 'uploading' })
        .where('id', '=', newPacket.id)
        .execute();

      const storageObjectName = `packets/${newPacket.id}.pdf`;
      const pdfStorageUrl = await uploadPdf(pdfBase64WithId, storageObjectName);
      console.log(`PDF stored for packet ${newPacket.id}`);

      // Update the packet record with the storage path
      await db
        .updateTable('packet')
        .set({ pdfStorageUrl })
        .where('id', '=', newPacket.id)
        .execute();

      console.log(`Packet ${newPacket.id} PDF storage updated`);

      // Create evidence events and compliance audit via helper
      await packetEvidenceCreator({
        packetId: newPacket.id,
        tradelineId: input.tradelineId ?? null,
        accountNumber,
        consumerName: validatedName,
        recipientName,
        letterContent,
        violationDetails,
        terminalLabel,
        now,
      });

      // Log packet generation for audit trail
      await logPacketGenerated(user.id, newPacket.id, input.tradelineId ?? 0, request);

      // Handle linked duplicate-account violations: mark related violations as ADDRESSED_VIA_LINKED_DISPUTE
      if (
        input.creditorObligationTestId != null &&
        (effectiveViolationCategory === "MULTIPLE_COLLECTOR_VIOLATION" ||
          effectiveViolationCategory === "COLLECTOR_DUPLICATE_REPORTING")
      ) {
        try {
          const obligationTest = await db
            .selectFrom("creditorObligationTest")
            .select("technicalDetails")
            .where("id", "=", input.creditorObligationTestId)
            .where("tradelineId", "=", input.tradelineId)
            .executeTakeFirst();

          const techDetails = obligationTest?.technicalDetails as Record<string, unknown> | null;
          const duplicateTradelineId =
            techDetails?.duplicateTradelineId != null
              ? Number(techDetails.duplicateTradelineId)
              : null;

          if (duplicateTradelineId) {
            const duplicateOwnerCheck = await db
              .selectFrom("tradeline")
              .select("id")
              .where("id", "=", duplicateTradelineId)
              .$if(!isAdmin, (qb) => qb.where("userId", "=", user.id))
              .executeTakeFirst();

            if (!duplicateOwnerCheck) {
              console.warn(
                `Linked duplicate violation handling skipped: duplicate tradeline ${duplicateTradelineId} is not accessible to user ${user.id}`
              );
            } else {
              const updateResult = await db
                .updateTable("creditorObligationTest")
                .set({ obligationState: "ADDRESSED_VIA_LINKED_DISPUTE" })
                .where("tradelineId", "=", duplicateTradelineId)
                .where("violationCategory", "in", [
                  "MULTIPLE_COLLECTOR_VIOLATION",
                  "COLLECTOR_DUPLICATE_REPORTING",
                ])
                .where("obligationState", "not in", [
                  "PROCEDURALLY_EXHAUSTED",
                  "ADDRESSED_VIA_LINKED_DISPUTE",
                ])
                .executeTakeFirst();

              const numUpdated = Number(updateResult?.numUpdatedRows ?? 0);
              console.log(
                `Linked duplicate violation handling: marked ${numUpdated} creditorObligationTest record(s) on duplicate tradeline ${duplicateTradelineId} as ADDRESSED_VIA_LINKED_DISPUTE`
              );
            }
          } else {
            console.log(
              `Linked duplicate violation handling: no duplicateTradelineId found in technicalDetails for creditorObligationTestId ${input.creditorObligationTestId}`
            );
          }
        } catch (linkedViolationError) {
          // Do not break the main packet creation flow if this step fails
          console.error(
            `Linked duplicate violation handling failed for creditorObligationTestId ${input.creditorObligationTestId}:`,
            linkedViolationError
          );
        }
      }

      // Step 4: Mark as 'completed' after all steps succeed
      await db
        .updateTable('packet')
        .set({ processingStatus: 'completed' })
        .where('id', '=', newPacket.id)
        .execute();

      console.log(`Packet ${newPacket.id} processing completed successfully`);

      const newPacketWithStorage = { ...newPacket, pdfStorageUrl, processingStatus: 'completed' as const };
      return new Response(JSON.stringify({ packet: newPacketWithStorage } satisfies OutputType));

    } catch (postInsertError) {
      // Step 5: Mark as 'failed' so the ghost packet is identifiable and can be cleaned up
      console.error(`Post-insert processing failed for packet ${newPacket.id}:`, postInsertError);
      await db
        .updateTable('packet')
        .set({ processingStatus: 'failed' })
        .where('id', '=', newPacket.id)
        .execute()
        .catch((updateError) => {
          // Log but don't swallow the original error
          console.error(`Failed to mark packet ${newPacket.id} as failed:`, updateError);
        });
      throw postInsertError;
    }

  } catch (error) {
    console.error("Error in packet/create_POST:", error);
    // Include detailed error in response for debugging
    if (error instanceof Error && !(error instanceof BusinessRuleError)) {
      console.error("Detailed error stack:", error.stack);
      return new Response(JSON.stringify({ 
        error: error.message || "Internal Server Error",
        errorType: error.name || "Unknown",
      }), { 
        status: error.name === "NotAuthenticatedError" ? 401 : 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return handleEndpointError(error);
  }
}
