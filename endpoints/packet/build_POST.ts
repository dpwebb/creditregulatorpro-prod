import { schema, OutputType } from "./build_POST.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";
import { 
  ontarioCRA, 
  novaScotiaCRA, 
  quebecCreditAgents,
  albertaPIPA,
  britishColumbiaCRA,
  manitobaCPA,
  saskatchewanCPBPA,
  newBrunswickCRA,
  princeEdwardIslandCRA,
  newfoundlandLabradorCPBPA,
  yukonCPA,
  northwestTerritoriesCPA,
  nunavutCPA,
  type TemplateContext
} from "../../helpers/packetTemplatesCA";
import { buildEquifaxDispute, type EquifaxDisputeContext } from "../../helpers/equifaxDisputeTemplate";
import { buildTransUnionDispute, type TransUnionDisputeContext } from "../../helpers/transunionDisputeTemplate";
import { mapViolationToDisputeReason } from "../../helpers/equifaxDisputeReasons";
import { generatePDF, type LetterContent } from "../../helpers/pdfGenerator";
import { uploadPdf } from "../../helpers/documentStorage";
import { chain } from "../../helpers/hashChain";
import { calculateTerminalLabel } from "../../helpers/terminalLabelProgression";
import { logPacketGenerated } from "../../helpers/auditLogger";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getLatestTwoSnapshots } from "../../helpers/tradelineSnapshotManager";
import { ensureUserSignature } from "../../helpers/signatureGenerator";
import { buildPacketStorageObjectName } from "../../helpers/packetFileNaming";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { letterHumanizer } from "../../helpers/letterHumanizer";

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    // Get user session for audit logging
    const { user } = await getServerUserSession(request);

    const rateLimitResult = await checkRateLimit(
      user.id.toString(),
      "PACKET_BUILD",
      RateLimitConfig.PACKET_BUILD.maxAttempts,
      RateLimitConfig.PACKET_BUILD.windowMinutes
    );
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // 1. Fetch obligation instance data with joins
    const instance = await db
      .selectFrom("obligationInstance")
      .innerJoin("obligation", "obligation.id", "obligationInstance.obligationId")
      .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .select([
        "obligationInstance.id as instanceId",
        "obligationInstance.notes",
        "obligationInstance.disputeVector",
        "obligation.id as obligationId",
        "obligation.obligationType",
        "tradeline.accountNumber",
        "tradeline.id as tradelineId",
        "tradeline.accountType",
        "tradeline.openedDate",
        "tradeline.originalCreditorName",
        "creditor.name as creditorJoinedName",
        "bureau.name as bureauName",
        "bureau.address as bureauAddress",
        "bureau.region as bureauRegion",
        "bureau.id as bureauId"
      ])
      .where("obligationInstance.id", "=", input.obligationInstanceId)
      .executeTakeFirst();

    if (!instance) {
      throw new Error("Obligation instance not found");
    }

    console.log(`Building packet for obligation instance ${input.obligationInstanceId}:`, {
      obligationType: instance.obligationType,
      bureauRegion: instance.bureauRegion,
      bureauName: instance.bureauName,
      tradelineId: instance.tradelineId
    });

    // 1.5. Query all obligation instances for this tradeline to calculate terminal label
    const allInstances = await db
      .selectFrom("obligationInstance")
      .selectAll()
      .where("tradelineId", "=", instance.tradelineId)
      .execute();

    // Calculate terminal label based on escalation count and exhaustion status
    const calculatedTerminalLabel = calculateTerminalLabel(allInstances);

    console.log(`Calculated terminal label for tradeline ${instance.tradelineId}: "${calculatedTerminalLabel}" (based on ${allInstances.length} instance(s))`);

    // 2. Fetch user account information
    const userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!userAccount) {
      throw new Error("User account not found. Please complete your profile before generating packets.");
    }

    // 3. Validate required consumer information (use overrides if provided, otherwise use user account)
    const consumerName = input.consumerName || userAccount.fullName;
    const consumerAddressLine1 = userAccount.addressLine1;
    const consumerCity = userAccount.city;
    const consumerProvince = userAccount.province;
    const consumerPostalCode = userAccount.postalCode;

    if (!consumerName || !consumerAddressLine1 || !consumerCity || !consumerProvince || !consumerPostalCode) {
      throw new Error("Incomplete consumer profile. Please complete your profile with: full name, address, city, province, and postal code before generating packets.");
    }

    // 4. Build consumer address array
    const consumerAddress: string[] = [consumerAddressLine1];
    if (userAccount.addressLine2) {
      consumerAddress.push(userAccount.addressLine2);
    }
    consumerAddress.push(`${consumerCity}, ${consumerProvince} ${consumerPostalCode}`);

    // 5. Format consumer DOB
    let consumerDOB: string | undefined;
    if (input.consumerDOB) {
      consumerDOB = input.consumerDOB;
    } else if (userAccount.dateOfBirth) {
      consumerDOB = new Date(userAccount.dateOfBirth).toLocaleDateString("en-CA");
    }

    // 6. Build recipient address array from bureau info
    const recipientName = instance.bureauName || "Credit Bureau";
    const recipientAddress: string[] = [];
    if (instance.bureauAddress) {
      // Bureau address is a single string, split by lines if it contains newlines
      const addressLines = instance.bureauAddress.split('\n').filter(line => line.trim());
      recipientAddress.push(...addressLines);
    } else {
      recipientAddress.push("Address Not Available");
    }

    // 7. Parse disputed items from disputeVector and transform to expected format
    let disputedItems: Array<{ description: string; reason: string; }>;
    const defaultReason = "Information is inaccurate, incomplete, or unverifiable";
    
    if (instance.disputeVector) {
      try {
        const parsed = JSON.parse(instance.disputeVector);
        let items: string[] = [];
        if (Array.isArray(parsed)) {
          items = parsed;
        } else if (typeof parsed === 'string') {
          items = [parsed];
        }
        
        if (items.length > 0) {
          disputedItems = items.map(item => ({
            description: item,
            reason: defaultReason
          }));
        } else {
          disputedItems = [{
            description: "All information reported for this account",
            reason: defaultReason
          }];
        }
      } catch (e) {
        // If not valid JSON, treat as single item
        disputedItems = [{
          description: instance.disputeVector,
          reason: defaultReason
        }];
      }
    } else {
      // If no dispute vector, use default
      disputedItems = [{
        description: "All information reported for this account",
        reason: defaultReason
      }];
    }

    // 8. Find the latest active statute version
    console.log(`Searching for active statute version: code="${instance.obligationType}", jurisdiction="${instance.bureauRegion}"`);
    
    let statuteVersion = await db
      .selectFrom("statuteVersion")
      .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
      .selectAll("statuteVersion")
      .select(["statute.code", "statute.jurisdiction"])
      .where("statute.code", "=", instance.obligationType ?? "")
      .where("statute.jurisdiction", "=", instance.bureauRegion ?? "")
      .where("statuteVersion.supersededDate", "is", null)
      .orderBy("statuteVersion.version", "desc")
      .executeTakeFirst();

    if (!statuteVersion) {
       // Fallback: try just code (for any jurisdiction)
       console.log(`No statute found for exact jurisdiction match, trying fallback with code only: "${instance.obligationType}"`);
       statuteVersion = await db
        .selectFrom("statuteVersion")
        .innerJoin("statute", "statute.id", "statuteVersion.statuteId")
        .selectAll("statuteVersion")
        .select(["statute.code", "statute.jurisdiction"])
        .where("statute.code", "=", instance.obligationType ?? "")
        .where("statuteVersion.supersededDate", "is", null)
        .orderBy("statuteVersion.version", "desc")
        .executeTakeFirst();
    }

    if (!statuteVersion) {
      const errorMsg = `Cannot generate packet: No active statute version found for obligation type "${instance.obligationType}" in jurisdiction "${instance.bureauRegion}". All available statute versions may be superseded or the statute may not exist in the system.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (statuteVersion.supersededDate !== null) {
      const errorMsg = `Cannot generate packet: The statute version found (ID: ${statuteVersion.id}, code: ${statuteVersion.code}, version: ${statuteVersion.version}) has been superseded on ${statuteVersion.supersededDate}. Please ensure an active statute version exists in the system.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`Using active statute version:`, {
      id: statuteVersion.id,
      code: statuteVersion.code,
      jurisdiction: statuteVersion.jurisdiction,
      version: statuteVersion.version,
      effectiveDate: statuteVersion.effectiveDate,
      sectionReference: statuteVersion.sectionReference
    });

    // 8.5 Resolve the authoritative creditor name from joined creditor record or original name
    const resolvedCreditorName =
      instance.creditorJoinedName?.trim() ||
      instance.originalCreditorName?.trim() ||
      "Unknown Creditor";

    // 9. Build complete TemplateContext with statute information
    const templateContext: TemplateContext = {
      consumerName: consumerName,
      consumerAddress: input.consumerAddress || consumerAddress,
      consumerDOB: consumerDOB,
      consumerPhone: input.consumerPhone || userAccount.phone || undefined,
      consumerEmail: input.consumerEmail || userAccount.email || undefined,
      
      recipientName: recipientName,
      recipientAddress: recipientAddress,
      
      accountNumber: instance.accountNumber || undefined,
      creditorName: resolvedCreditorName,
      
      disputedItems: disputedItems,
      additionalNotes: instance.notes || undefined,
      
      // Include statute information for more specific letter content
      statuteSection: statuteVersion.sectionReference || undefined,
      statuteDescription: statuteVersion.description || undefined,
      statuteSourceUrl: statuteVersion.sourceUrl || undefined,
    };

    // 10. Select Template
    const jurisdiction = statuteVersion.jurisdiction;
    const code = statuteVersion.code;
    const bureauNameNormalized = (instance.bureauName ?? "").toLowerCase();

    const disputeReasonCode = mapViolationToDisputeReason(instance.obligationType);

    let letterContent: LetterContent;

    if (bureauNameNormalized.includes("equifax")) {
      console.log(`Bureau "${instance.bureauName}" identified as Equifax — using Equifax bureau-specific dispute template (reason code: ${disputeReasonCode})`);
      const equifaxCtx: EquifaxDisputeContext = {
        consumerName: consumerName,
        consumerAddress: input.consumerAddress ?? consumerAddress,
        consumerDOB: consumerDOB,
        consumerPhone: input.consumerPhone ?? userAccount.phone ?? undefined,
        consumerEmail: input.consumerEmail ?? userAccount.email ?? undefined,
        creditorName: resolvedCreditorName,
        accountNumber: instance.accountNumber ?? "",
        disputeReasonCode: disputeReasonCode,
        additionalNotes: instance.notes ?? undefined,
      };
      letterContent = await buildEquifaxDispute(equifaxCtx, consumerProvince);

    } else if (bureauNameNormalized.includes("transunion") || bureauNameNormalized.includes("trans union")) {
      console.log(`Bureau "${instance.bureauName}" identified as TransUnion — using TransUnion bureau-specific dispute template (reason code: ${disputeReasonCode})`);
      const transunionCtx: TransUnionDisputeContext = {
        consumerName: consumerName,
        consumerAddress: input.consumerAddress ?? consumerAddress,
        consumerDOB: consumerDOB,
        consumerPhone: input.consumerPhone ?? userAccount.phone ?? undefined,
        consumerEmail: input.consumerEmail ?? userAccount.email ?? undefined,
        creditorName: resolvedCreditorName,
        accountNumber: instance.accountNumber ?? "",
        disputeReasonCode: disputeReasonCode,
        additionalNotes: instance.notes ?? undefined,
      };
      letterContent = await buildTransUnionDispute(transunionCtx, consumerProvince);

    } else if (code === "A-8.2" && jurisdiction === "Quebec") {
      letterContent = await quebecCreditAgents(templateContext);
    } else if (code === "PIPA" && jurisdiction === "Alberta") {
      letterContent = await albertaPIPA(templateContext);
    } else if (code === "CRA") {
      switch (jurisdiction) {
        case "Nova Scotia":
          letterContent = await novaScotiaCRA(templateContext);
          break;
        case "British Columbia":
          letterContent = await britishColumbiaCRA(templateContext);
          break;
        case "New Brunswick":
          letterContent = await newBrunswickCRA(templateContext);
          break;
        case "Prince Edward Island":
          letterContent = await princeEdwardIslandCRA(templateContext);
          break;
        case "Ontario":
          letterContent = await ontarioCRA(templateContext);
          break;
        default:
          console.warn(`Unknown CRA jurisdiction: ${jurisdiction}, defaulting to Ontario CRA template`);
          letterContent = await ontarioCRA(templateContext);
      }
    } else if (code === "CPA") {
      switch (jurisdiction) {
        case "Manitoba":
          letterContent = await manitobaCPA(templateContext);
          break;
        case "Yukon":
          letterContent = await yukonCPA(templateContext);
          break;
        case "Northwest Territories":
          letterContent = await northwestTerritoriesCPA(templateContext);
          break;
        case "Nunavut":
          letterContent = await nunavutCPA(templateContext);
          break;
        default:
          console.warn(`Unknown CPA jurisdiction: ${jurisdiction}, defaulting to Manitoba CPA template`);
          letterContent = await manitobaCPA(templateContext);
      }
    } else if (code === "CPBPA") {
      switch (jurisdiction) {
        case "Saskatchewan":
          letterContent = await saskatchewanCPBPA(templateContext);
          break;
        case "Newfoundland and Labrador":
          letterContent = await newfoundlandLabradorCPBPA(templateContext);
          break;
        default:
          console.warn(`Unknown CPBPA jurisdiction: ${jurisdiction}, defaulting to Saskatchewan CPBPA template`);
          letterContent = await saskatchewanCPBPA(templateContext);
      }
    } else {
      console.warn(`No specific template found for jurisdiction "${jurisdiction}" with statute code "${code}". Defaulting to Ontario CRA template.`);
      letterContent = await ontarioCRA(templateContext);
    }

    // Keep the legacy obligation-instance path aligned with packet/create letter cleanup.
    letterContent = await letterHumanizer(letterContent);

    // 11. Attach user's digital signature to the letter
    const signatureImage = await ensureUserSignature(user.id);
    if (signatureImage) {
      letterContent.signatureImage = signatureImage;
    }
    console.log(`Digital signature attached for user ${user.id}`);

    // 12. Final safety check before packet insertion
    if (statuteVersion.supersededDate !== null) {
      throw new Error(`Safety check failed: Attempted to create packet with superseded statute version ${statuteVersion.id}`);
    }

    // 13. Insert Packet with processingStatus 'pending' to reserve the record
    console.log(`Inserting packet record with processingStatus='pending' for tradeline ${instance.tradelineId}`);
    const packetResult = await db
      .insertInto("packet")
      .values({
        tradelineId: instance.tradelineId,
        userId: user.id,
        type: code,
        signatureMode: "DIGITAL",
        region: "CA",
        pdfStorageUrl: null,
        status: "GENERATED",
        content: JSON.stringify(letterContent),
        terminalLabel: calculatedTerminalLabel,
        statuteVersionId: statuteVersion.id,
        letterDate: new Date(),
        processingStatus: 'pending',
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    console.log(`Packet created successfully with ID ${packetResult.id}`);

    // Post-insert pipeline: PDF generation, GCS upload, evidence creation — wrap in try/catch to mark as failed on error
    try {
      // 13a. Set baseline_snapshot_id on the packet from the latest tradeline snapshot
      const { current: currentSnapshot } = await getLatestTwoSnapshots(instance.tradelineId);
      if (currentSnapshot) {
        await db
          .updateTable("packet")
          .set({ baselineSnapshotId: currentSnapshot.id })
          .where("id", "=", packetResult.id)
          .execute();
        console.log(`Baseline snapshot ${currentSnapshot.id} linked to packet ${packetResult.id}`);
      } else {
        console.log(`No existing snapshot found for tradeline ${instance.tradelineId}; baselineSnapshotId left null on packet ${packetResult.id}`);
      }

      // 13b. Auto-link unlinked challenge logs for this tradeline to this packet
      const linkedChallengeLogsResult = await db
        .updateTable("obligationChallengeLog")
        .set({ packetId: packetResult.id })
        .where("tradelineId", "=", instance.tradelineId)
        .where("packetId", "is", null)
        .executeTakeFirst();
      const linkedCount = Number(linkedChallengeLogsResult?.numUpdatedRows ?? 0);
      console.log(`Linked ${linkedCount} unlinked challenge log(s) to packet ${packetResult.id} for tradeline ${instance.tradelineId}`);

      // 14. Mark as 'generating' then generate PDF
      await db
        .updateTable("packet")
        .set({ processingStatus: 'generating' })
        .where("id", "=", packetResult.id)
        .execute();

      console.log(`Generating PDF for packet ${packetResult.id} using statute version ${statuteVersion.id}`);
      const pdfBase64 = await generatePDF(letterContent, user.id.toString(), packetResult.id.toString());

      const now = new Date();

      // Mark as 'uploading' then store PDF
      await db
        .updateTable("packet")
        .set({ processingStatus: 'uploading' })
        .where("id", "=", packetResult.id)
        .execute();

      const storageObjectName = buildPacketStorageObjectName(
        packetResult.id,
        consumerName,
        recipientName,
        resolvedCreditorName,
        now
      );
      const pdfStorageUrl = await uploadPdf(pdfBase64, storageObjectName);
      console.log(`PDF stored for packet ${packetResult.id}`);

      // 15. Update the packet record with the storage path
      await db
        .updateTable("packet")
        .set({ pdfStorageUrl })
        .where("id", "=", packetResult.id)
        .execute();

      // 16. Create Evidence Event (PACKET_GENERATED)
      const eventType = "PACKET_GENERATED";
      
      const currentHash = chain(undefined, {
        packetId: packetResult.id,
        eventType,
        at: now,
        letterContent: letterContent,
        disputeVector: instance.disputeVector,
        accountNumber: instance.accountNumber,
        statuteVersionId: statuteVersion.id
      });

      const statuteRef = statuteVersion.sectionReference 
        ? `${statuteVersion.code} ${statuteVersion.sectionReference}`
        : statuteVersion.code;
      
      const evidenceEventResult = await db
        .insertInto("evidenceEvent")
        .values({
          packetId: packetResult.id,
          eventType: eventType,
          at: now,
          region: "CA",
          previousHash: null,
          currentHash: currentHash,
          description: `Dispute packet generated for tradeline account ${instance.accountNumber} using ${statuteRef}. Consumer: ${consumerName}, Recipient: ${recipientName}`,
          statuteVersionId: statuteVersion.id
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      console.log(`Evidence event created for packet ${packetResult.id}, hash: ${currentHash}`);

      // 16b. If terminal label is Phase 4 (Procedural Exhaustion), insert an additional evidence event
      if (calculatedTerminalLabel === "PHASE 4: PROCEDURAL EXHAUSTION — PENDING") {
        const existingTerminalEvent = await db
          .selectFrom("evidenceEvent")
          .innerJoin("packet", "packet.id", "evidenceEvent.packetId")
          .select("evidenceEvent.id")
          .where("evidenceEvent.eventType", "=", "TERMINAL_LABEL_REACHED")
          .where("packet.tradelineId", "=", instance.tradelineId)
          .executeTakeFirst();

        if (existingTerminalEvent) {
          console.log(`Skipping TERMINAL_LABEL_REACHED event for packet ${packetResult.id} — event already exists for tradeline ${instance.tradelineId} (existing event ID: ${existingTerminalEvent.id})`);
        } else {
          const terminalHash = chain(currentHash, {
            packetId: packetResult.id,
            eventType: "TERMINAL_LABEL_REACHED",
            at: now,
            tradelineId: instance.tradelineId,
          });
          await db
            .insertInto("evidenceEvent")
            .values({
              packetId: packetResult.id,
              eventType: "TERMINAL_LABEL_REACHED",
              at: now,
              region: "CA",
              previousHash: currentHash,
              currentHash: terminalHash,
              description: `Phase 4: Procedural Exhaustion reached for tradeline ${instance.tradelineId}`,
              statuteVersionId: statuteVersion.id,
            })
            .execute();
          console.log(`Terminal label evidence event inserted for packet ${packetResult.id}, tradeline ${instance.tradelineId}`);
        }
      }

      // 17. Record compliance audit
      await db
        .insertInto("packetComplianceAudit")
        .values({
          packetId: packetResult.id,
          obligationId: instance.obligationId,
          statuteVersionId: statuteVersion.id,
          appliedAt: now,
          evidenceEventId: evidenceEventResult.id,
          complianceStatus: "APPLIED",
          selectionReason: `Statute selected based on jurisdiction ${jurisdiction} and obligation type ${code}. Formal legal letter format applied with complete consumer and recipient information.`,
          regulationType: "STATUTE",
          region: "CA"
        })
        .execute();

      console.log(`Compliance audit recorded for packet ${packetResult.id}`);

      // 18. Log packet generation audit event
      await logPacketGenerated(
        user.id,
        packetResult.id,
        instance.tradelineId,
        request
      );

      // Mark as 'completed' after all steps succeed
      await db
        .updateTable("packet")
        .set({ processingStatus: 'completed' })
        .where("id", "=", packetResult.id)
        .execute();

      console.log(`Packet ${packetResult.id} processing completed successfully`);

      return new Response(
        JSON.stringify({ 
          ok: true, 
          packetId: packetResult.id 
        } satisfies OutputType),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    } catch (postInsertError) {
      // Mark as 'failed' so the ghost packet is identifiable and can be cleaned up
      console.error(`Post-insert processing failed for packet ${packetResult.id}:`, postInsertError);
      await db
        .updateTable("packet")
        .set({ processingStatus: 'failed' })
        .where("id", "=", packetResult.id)
        .execute()
        .catch((updateError) => {
          // Log but don't swallow the original error
          console.error(`Failed to mark packet ${packetResult.id} as failed:`, updateError);
        });
      throw postInsertError;
    }

  } catch (error) {
    console.error("Error in packet/build_POST:", error);
    return handleEndpointError(error);
  }
}
