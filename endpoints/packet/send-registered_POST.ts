import { schema, OutputType, PostGridErrorType } from "./send-registered_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";
import { createHash } from "crypto";
import { calculateDeadline, createDeadlineEvent } from "../../helpers/deadlineCalculator";
import { Transaction } from "kysely";
import { DB } from "../../helpers/schema";
import { generatePDF, LetterContent } from "../../helpers/pdfGenerator";
import { sendRegisteredMail } from "../../helpers/postgridClient";
import { getBureauRegisteredMailAddress } from "../../helpers/bureauDisputeAddresses";
import { verifyPaymentIntent, refundPaymentIntent } from "../../helpers/stripeServer";
import { getPostalPricingFromDB } from "../../helpers/getPostalPricingFromDB";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";

const INTEGRITY_BLOCK_MESSAGE = "Transmission blocked: system integrity check failed. All conditions must be met before submission.";

function generateHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Parses a raw PostGrid error message and returns a user-friendly plain-language
 * error type and message (Grade 8 reading level).
 */
function parsePostGridError(rawMessage: string): { errorType: PostGridErrorType; userMessage: string } {
  const lower = rawMessage.toLowerCase();

  // "cannot send from" → sender (FROM) address verification failure
  if (lower.includes("cannot send from") || lower.includes("send from") || (lower.includes("failed to verify") && lower.includes("from"))) {
    return {
      errorType: "address_from",
      userMessage:
        "We couldn't send your letter because your mailing address could not be verified by Canada Post. " +
        "Please check and update your address in Profile Settings and try again.",
    };
  }

  // "cannot send to" → recipient (TO) address verification failure
  if (lower.includes("cannot send to") || lower.includes("send to") || (lower.includes("failed to verify") && lower.includes("to"))) {
    return {
      errorType: "address_to",
      userMessage:
        "We couldn't send your letter because the recipient address could not be verified by Canada Post. " +
        "Please create a new letter with the correct recipient address.",
    };
  }

  // Generic address verification failure (no clear direction)
  if (lower.includes("failed to verify") || lower.includes("address") || lower.includes("verify")) {
    return {
      errorType: "other",
      userMessage:
        "We couldn't send your letter because an address could not be verified by Canada Post. " +
        "Please check your address in Profile Settings and the recipient address on this letter, then try again.",
    };
  }

  // Generic fallback
  return {
    errorType: "other",
    userMessage:
      "Something went wrong when trying to mail your letter. Your payment has been refunded. Please try again later.",
  };
}

async function buildAndInsertObligationInstance(
  trx: Transaction<DB>,
  params: {
    tradelineId: number | null;
    userId: number;
    challengeSentDate: Date;
    responseDeadline: Date;
    disputeVector: string | null;
    packetId: number;
    deliveryMethod: string;
  }
): Promise<number> {
  const result = await trx
    .insertInto("obligationInstance")
    .values({
      tradelineId: params.tradelineId,
      userId: params.userId,
      challengeSentDate: params.challengeSentDate,
      state: "CHALLENGED",
      responseDeadline: params.responseDeadline,
      disputeVector: params.disputeVector,
      notes: `Packet #${params.packetId} sent via ${params.deliveryMethod}`,
      createdAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return result.id;
}

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const session = await getServerUserSession(request);
    const userId = session.user.id;

    const rateLimitResult = await checkRateLimit(
      userId.toString(),
      "SEND_REGISTERED",
      RateLimitConfig.SEND_REGISTERED.maxAttempts,
      RateLimitConfig.SEND_REGISTERED.windowMinutes
    );
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const [json, pricing] = await Promise.all([
      request.text().then((text) => JSON.parse(text)),
      getPostalPricingFromDB(),
    ]);
    const input = schema.parse(json);

    // Compute pricing breakdown for registered mail
    const rawCost = pricing.baseCost + pricing.baseCost * pricing.surchargeRate;
    const surcharge = pricing.baseCost * pricing.surchargeRate;
    const registeredCost = pricing.registeredCost; // rawCost * 1.15 — user-facing price with markup
    const markupAmount = registeredCost - rawCost;

    // System integrity checks (before any other processing)
    // 1. userReviewed and userApproved must be true (enforced by schema literal, but double-check)
    if (input.userReviewed !== true || input.userApproved !== true) {
      console.warn(`Integrity check failed: userReviewed=${input.userReviewed}, userApproved=${input.userApproved} for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // 2. consent_active: user must have accepted terms
    const userAccountForConsent = await db
      .selectFrom("userAccount")
            .select(["termsAcceptedAt"])
      .where("userId", "=", userId)
      .executeTakeFirst();

    const consentActive = userAccountForConsent?.termsAcceptedAt != null;
    if (!consentActive) {
      console.warn(`Integrity check failed: termsAcceptedAt is null for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // 3. representation_flag = false (CRP never represents — hardcoded)
    const representationFlag = false;
    if (representationFlag) {
      console.warn(`Integrity check failed: representationFlag is true for userId=${userId}`);
      return new Response(JSON.stringify({ error: INTEGRITY_BLOCK_MESSAGE }), { status: 403 });
    }

    // 1. Verify user owns the packet
    const packet = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "packet.tradelineId", "tradeline.id")
      .leftJoin("bureau", "packet.bureauId", "bureau.id")
      .select([
        "packet.id",
        "packet.userId",
        "packet.tradelineId",
        "packet.creditorObligationTestId",
        "packet.status",
        "packet.content",
        "packet.bureauId",
        "packet.recipientName",
        "packet.recipientAddressLine1",
        "packet.recipientAddressLine2",
        "packet.recipientCity",
        "packet.recipientProvince",
        "packet.recipientPostalCode",
        "bureau.name as bureauName",
        "bureau.addressLine1 as bureauAddressLine1",
        "bureau.addressLine2 as bureauAddressLine2",
        "bureau.city as bureauCity",
        "bureau.province as bureauProvince",
        "bureau.postalCode as bureauPostalCode"
      ])
      .where("packet.id", "=", input.packetId)
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
    }

    if (packet.userId !== userId) {
      return new Response(JSON.stringify({ error: "Unauthorized access to packet" }), { status: 403 });
    }

    if (packet.status && packet.status !== "GENERATED" && packet.status !== "PENDING") {
      return new Response(JSON.stringify({ error: "Packet has already been sent or is processing" }), { status: 400 });
    }

    // 2. Check user's subscription plan
    const subscription = await db
      .selectFrom("subscriptions")
      .select(["plan", "status"])
      .where("userId", "=", userId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    const isBetaUser = subscription?.plan === "beta";

    // 3. Payment verification for non-beta users
    if (!isBetaUser) {
      if (!input.paymentIntentId) {
        return new Response(
          JSON.stringify({ error: "Payment required for non-beta users" }),
          { status: 402 }
        );
      }

      try {
        await verifyPaymentIntent(input.paymentIntentId);
        console.log(`Payment intent ${input.paymentIntentId} verified successfully for user ${userId}`);
      } catch (verifyError) {
        console.error("Payment verification failed:", verifyError);
        const message = verifyError instanceof Error ? verifyError.message : "Payment verification failed";
        return new Response(
          JSON.stringify({ error: `Payment verification failed: ${message}` }),
          { status: 402 }
        );
      }
    }

    // 4. Fetch user's "document_signing" signature
    const signature = await db.selectFrom("consumerSignature")
      .select(["signatureData"])
      .where("userId", "=", userId)
      .where("signatureType", "=", "document_signing")
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst();

    if (!signature) {
      return new Response(JSON.stringify({ error: "Please add your signature in profile settings before sending via registered mail." }), { status: 400 });
    }

    if (!packet.content) {
      return new Response(JSON.stringify({ error: "Packet content is empty." }), { status: 400 });
    }

    let letterContent: LetterContent;
    try {
      letterContent = JSON.parse(packet.content);
    } catch {
      return new Response(JSON.stringify({ error: "Packet content is not structured properly." }), { status: 400 });
    }

    // Add signature image dynamically
    letterContent.signatureImage = signature.signatureData;

    // Override letterContent recipient fields if packet has custom recipient address
    if (
      packet.recipientName &&
      packet.recipientAddressLine1 &&
      packet.recipientCity &&
      packet.recipientProvince &&
      packet.recipientPostalCode
    ) {
      letterContent.recipientName = packet.recipientName;
      const recipientAddressLines: string[] = [packet.recipientAddressLine1];
      if (packet.recipientAddressLine2) {
        recipientAddressLines.push(packet.recipientAddressLine2);
      }
      recipientAddressLines.push(`${packet.recipientCity}, ${packet.recipientProvince} ${packet.recipientPostalCode}`);
      letterContent.recipientAddress = recipientAddressLines;
      console.log(`Overriding letterContent recipient address from packet fields (packetId=${input.packetId})`);
    }

    // 5. Fetch user account for sender address
        const userAccount = await db.selectFrom("userAccount")
      .where("userId", "=", userId)
      .select(["addressLine1", "addressLine2", "city", "province", "postalCode", "fullName"])
      .executeTakeFirst();

    if (!userAccount?.addressLine1 || !userAccount?.city || !userAccount?.province || !userAccount?.postalCode) {
      return new Response(JSON.stringify({ error: "Please complete your full address in profile settings before sending." }), { status: 400 });
    }

    const fromAddress = {
      name: userAccount.fullName || session.user.displayName,
      addressLine1: userAccount.addressLine1,
      addressLine2: userAccount.addressLine2 || undefined,
      city: userAccount.city,
      provinceOrState: userAccount.province,
      postalOrZip: userAccount.postalCode,
      countryCode: "CA"
    };

    // 6. Determine recipient bureau address
    // Priority: packet.recipient_* → bureau DB record → hardcoded bureau address → letterContent recipient
    let bureauAddress;
    if (
      packet.recipientName &&
      packet.recipientAddressLine1 &&
      packet.recipientCity &&
      packet.recipientProvince &&
      packet.recipientPostalCode
    ) {
      bureauAddress = {
        name: packet.recipientName,
        addressLine1: packet.recipientAddressLine1,
        addressLine2: packet.recipientAddressLine2 ?? undefined,
        city: packet.recipientCity,
        provinceOrState: packet.recipientProvince,
        postalOrZip: packet.recipientPostalCode,
        countryCode: "CA",
      };
      console.log(`Using packet recipient fields for bureauAddress (packetId=${input.packetId})`);
    } else if (packet.bureauName && packet.bureauAddressLine1 && packet.bureauCity && packet.bureauProvince && packet.bureauPostalCode) {
      bureauAddress = {
        name: packet.bureauName,
        addressLine1: packet.bureauAddressLine1,
        addressLine2: packet.bureauAddressLine2 || undefined,
        city: packet.bureauCity,
        provinceOrState: packet.bureauProvince,
        postalOrZip: packet.bureauPostalCode,
        countryCode: "CA"
      };
    } else if (packet.bureauName || packet.bureauId) {
      let bureauNameForLookup = packet.bureauName;
      if (!bureauNameForLookup && packet.bureauId) {
        const b = await db.selectFrom("bureau").where("id", "=", packet.bureauId).select("name").executeTakeFirst();
        bureauNameForLookup = b?.name || "";
      }
      const hc = getBureauRegisteredMailAddress(bureauNameForLookup || "");
      if (hc) {
        bureauAddress = hc;
      }
    }

    if (!bureauAddress) {
      if (letterContent.recipientName && letterContent.recipientAddress && letterContent.recipientAddress.length >= 2) {
        bureauAddress = {
          name: letterContent.recipientName,
          addressLine1: letterContent.recipientAddress[0],
          city: "Unknown",
          provinceOrState: "Unknown",
          postalOrZip: "Unknown",
          countryCode: "CA"
        };
      } else {
        return new Response(JSON.stringify({ error: "Could not determine recipient bureau address." }), { status: 400 });
      }
    }

    // 7. Generate PDF base64 with signature included
    const base64Pdf = await generatePDF(letterContent, userId.toString(), input.packetId.toString());
    const dataUri = `data:application/pdf;base64,${base64Pdf}`;

    // 8. Call PostGrid — if this fails after payment was verified, we need to refund
    let pgResponse;
    try {
      pgResponse = await sendRegisteredMail({
        to: bureauAddress,
        from: fromAddress,
        pdf: dataUri,
        mailingClass: "ca_post_registered"
      });
    } catch (postgridError) {
      console.error("PostGrid call failed:", postgridError);

      const rawMsg = postgridError instanceof Error ? postgridError.message : "Unknown mailing error";
      const parsed = parsePostGridError(rawMsg);

      // If a non-beta user already paid, issue a refund
      if (!isBetaUser && input.paymentIntentId) {
        try {
          await refundPaymentIntent(input.paymentIntentId);
          console.log(`Refunded payment intent ${input.paymentIntentId} after PostGrid failure`);

          // Record the refunded transaction
          await db
            .insertInto("postalTransaction")
            .values({
              userId,
              baseCostCad: parseFloat(rawCost.toFixed(2)).toFixed(2),
              surchargeCad: parseFloat(surcharge.toFixed(2)).toFixed(2),
              markupCad: parseFloat(markupAmount.toFixed(2)).toFixed(2),
              amountCad: parseFloat(registeredCost.toFixed(2)).toFixed(2),
              description: "Canada Post Registered Mail — refunded due to dispatch failure",
              packetId: input.packetId,
              postgridLetterId: null,
              stripePaymentIntentId: input.paymentIntentId,
              status: "refunded",
              createdAt: new Date(),
            })
            .execute();
        } catch (refundError) {
          console.error("Refund failed after PostGrid error:", refundError);
          // Fall through — still return the original PostGrid error but log the refund failure
        }

        const refundMessage = parsed.userMessage.includes("Your payment has been refunded")
          ? parsed.userMessage
          : `${parsed.userMessage} Your payment has been refunded.`;

        return new Response(
          JSON.stringify({
            success: false,
            message: refundMessage,
            paymentRefunded: true,
            errorDetails: { type: parsed.errorType, userMessage: parsed.userMessage },
          } satisfies OutputType),
          { status: 502 }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: parsed.userMessage,
          paymentRefunded: false,
          errorDetails: { type: parsed.errorType, userMessage: parsed.userMessage },
        } satisfies OutputType),
        { status: 502 }
      );
    }

    const BASE_COST_CAD = parseFloat(rawCost.toFixed(2));
    const SURCHARGE_CAD = parseFloat(surcharge.toFixed(2));
    const MARKUP_CAD = parseFloat(markupAmount.toFixed(2));
    const TOTAL_AMOUNT_CAD = parseFloat(registeredCost.toFixed(2));

    const now = new Date();
    const postgridLetterId: string = pgResponse.id;

    // 9. Fetch dispute vector
    let disputeVector: string | null = null;
    if (packet.creditorObligationTestId != null) {
      const cot = await db
        .selectFrom("creditorObligationTest")
        .select(["disputeVector"])
        .where("id", "=", packet.creditorObligationTestId)
        .executeTakeFirst();
      disputeVector = cot?.disputeVector ?? null;
    }

    const { deadline: responseDeadline } = calculateDeadline(now, "CA", false);

    let newObligationInstanceId: number | null = null;

    // 10. Execute Data Transaction (PostGrid succeeded — safe to persist)
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("packet")
        .set({
          deliveryMethod: "Canada Post Registered Mail",
          trackingNumber: pgResponse.trackingNumber || null,
          postgridLetterId: pgResponse.id,
          sentDate: now,
          status: "SENT",
        })
        .where("id", "=", input.packetId)
        .execute();

      const lastEvent = await trx
        .selectFrom("evidenceEvent")
        .select(["currentHash"])
        .where("packetId", "=", input.packetId)
        .orderBy("at", "desc")
        .limit(1)
        .executeTakeFirst();

      const previousHash = lastEvent?.currentHash || null;

      const eventData = {
        packetId: input.packetId,
        eventType: "PACKET_SENT",
        deliveryMethod: "Canada Post Registered Mail",
        trackingNumber: pgResponse.trackingNumber,
        postgridLetterId: pgResponse.id,
        sentDate: now.toISOString(),
        timestamp: new Date().toISOString(),
        previousHash
      };

      const currentHash = generateHash(JSON.stringify(eventData));
      const description = `Packet sent via Canada Post Registered Mail (Tracking: ${pgResponse.trackingNumber || 'Pending'})`;

      await trx
        .insertInto("evidenceEvent")
        .values({
          packetId: input.packetId,
          eventType: "PACKET_SENT",
          description: description,
          previousHash: previousHash,
          currentHash: currentHash,
          at: new Date(),
          region: "CA"
        })
        .execute();

      // Create postal transaction record — include stripePaymentIntentId for non-beta users
      await trx
        .insertInto("postalTransaction")
        .values({
          userId,
          baseCostCad: BASE_COST_CAD.toFixed(2),
          surchargeCad: SURCHARGE_CAD.toFixed(2),
          markupCad: MARKUP_CAD.toFixed(2),
          amountCad: TOTAL_AMOUNT_CAD.toFixed(2),
          description: "Canada Post Registered Mail — packet dispatch",
          packetId: input.packetId,
          postgridLetterId: postgridLetterId,
          stripePaymentIntentId: input.paymentIntentId ?? null,
          status: "completed",
          createdAt: now,
        })
        .execute();

      await trx
        .insertInto("auditLog")
        .values({
          actionType: "UPDATE",
          entityType: "PACKET",
          entityId: input.packetId,
          userId: userId,
                    details: {
            field: "delivery_info",
            method: "Canada Post Registered Mail",
            tracking: pgResponse.trackingNumber,
            postgridId: pgResponse.id,
            stripePaymentIntentId: input.paymentIntentId ?? null,
            isBetaUser,
          } as any,
          status: "SUCCESS",
          timestamp: new Date(),
          region: "CA"
        })
        .execute();

      // Only create an obligation instance when the packet has an associated tradeline
      if (packet.tradelineId != null) {
        newObligationInstanceId = await buildAndInsertObligationInstance(trx, {
          tradelineId: packet.tradelineId,
          userId,
          challengeSentDate: now,
          responseDeadline,
          disputeVector,
          packetId: input.packetId,
          deliveryMethod: "Canada Post Registered Mail",
        });
      } else {
        console.log(`Skipping obligation instance creation — packet ${input.packetId} has no associated tradeline`);
      }
    });

    // 11. Create statutory deadline external to the main transaction
    let deadlineWarning: string | undefined;

    try {
      await createDeadlineEvent({
        obligationInstanceId: newObligationInstanceId ?? undefined,
        packetId: input.packetId,
        eventType: "BUREAU_RESPONSE_DEADLINE",
        deadline: responseDeadline,
        title: "Bureau Response Due",
        description: `30-day statutory response deadline for packet sent via Canada Post Registered Mail on ${now.toLocaleDateString("en-CA")}`,
        region: "CA",
      });
      console.log(`Created deadlineEvent for packet ${input.packetId} (obligationInstance ${newObligationInstanceId})`);
    } catch (deadlineError) {
      console.error(`Failed to create deadlineEvent for packet ${input.packetId} (obligationInstance ${newObligationInstanceId}):`, deadlineError);
      deadlineWarning = "Your letter was sent successfully, but the 30-day response deadline reminder could not be created. Please contact support.";
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Packet sent via registered mail successfully",
      trackingNumber: pgResponse.trackingNumber,
      expectedDeliveryDate: pgResponse.expectedDeliveryDate,
      postgridLetterId: postgridLetterId,
      testMode: pgResponse.testMode,
      paymentRefunded: false,
      ...(deadlineWarning ? { deadlineWarning } : {}),
    } satisfies OutputType));

  } catch (error) {
    console.error("Error sending packet via registered mail:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized") || error.message.includes("Not authenticated")) {
        return new Response(JSON.stringify({ error: error.message }), { status: 401 });
      }
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }), { status: 400 });
  }
}