import { schema } from "./pdf_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { readStoredPdf } from "../../helpers/documentStorage";
import { buildPacketPdfFilename } from "../../helpers/packetFileNaming";
import {
  attachConsumerIdentificationToLetterContent,
  getConsumerIdentificationPdfAttachment,
} from "../../helpers/consumerIdentification";
import {
  attachIdentificationToPacketContent,
  generatePacketContentPdfBase64,
  parseStoredPacketContent,
} from "../../helpers/packetPdfContent";
import { isSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { getOrRenderPacketPdfBase64 } from "../../helpers/packetPdfCache";

type IdentificationPdfAttachment = Awaited<ReturnType<typeof getConsumerIdentificationPdfAttachment>>;

async function recordPacketDownload(packetId: number, actorUserId: number, currentStatus: string | null) {
  const now = new Date();
  await db.transaction().execute(async (trx) => {
    if (["generated", "draft", "GENERATED", "Draft"].includes(currentStatus ?? "")) {
      await trx
        .updateTable("packet")
        .set({ status: "downloaded" })
        .where("id", "=", packetId)
        .execute();
    }

    await trx
      .insertInto("auditLog")
      .values({
        actionType: "DOWNLOAD",
        entityType: "PACKET",
        entityId: packetId,
        userId: actorUserId,
        details: { statusBeforeDownload: currentStatus } as any,
        status: "SUCCESS",
        timestamp: now,
        region: "CA",
      })
      .execute();
  });
}

async function getOptionalIdentificationPdfAttachment(userId: number): Promise<IdentificationPdfAttachment> {
  try {
    return await getConsumerIdentificationPdfAttachment(userId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(
        `[packet-pdf] Saved consumer identification file is missing for user ${userId}; rendering packet without the ID attachment.`,
      );
      return null;
    }

    throw error;
  }
}

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams);
    
    // Validate input using schema
    const input = schema.parse(searchParams);

    const packet = await db
      .selectFrom("packet")
      .leftJoin("userAccount", "userAccount.userId", "packet.userId")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .select([
        "packet.userId",
        "packet.pdfStorageUrl",
        "packet.status",
        "packet.content",
        "packet.letterDate",
        "packet.createdAt",
        "userAccount.fullName as consumerFullName",
        "bureau.name as bureauName",
        "creditor.name as creditorJoinedName",
        "tradeline.originalCreditorName",
      ])
      .where("packet.id", "=", input.packetId)
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // Check authorization
    if (user.role !== "admin" && packet.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to packet" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    // Build descriptive filename
    const consumerName = packet.consumerFullName || "Consumer";
    const bureauName = packet.bureauName || "Bureau";
    const creditorName = packet.creditorJoinedName || packet.originalCreditorName || "Creditor";
    const fileDate = packet.letterDate
      ? new Date(packet.letterDate)
      : packet.createdAt
      ? new Date(packet.createdAt)
      : new Date();

    const filename = buildPacketPdfFilename(consumerName, bureauName, creditorName, fileDate);
    console.log(`Serving PDF for packet ${input.packetId} with filename: "${filename}"`);

    if (packet.content) {
      try {
        const packetContent = parseStoredPacketContent(packet.content);
        const isSimplePacket = isSimpleDisputePacketContent(packetContent);
        const identificationAttachment = packet.userId
          ? await getOptionalIdentificationPdfAttachment(packet.userId)
          : null;

        if (!identificationAttachment && packet.userId === user.id && !isSimplePacket) {
          return new Response(JSON.stringify({ error: "Please upload your identification in profile settings before downloading this packet." }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        if (identificationAttachment) {
          if (isSimplePacket) {
            attachIdentificationToPacketContent(packetContent, identificationAttachment);
          } else {
            attachConsumerIdentificationToLetterContent(packetContent, identificationAttachment);
          }
        }

        const { base64Pdf } = await getOrRenderPacketPdfBase64({
          packetId: input.packetId,
          userId: String(packet.userId ?? user.id),
          purpose: "download",
          packetContent,
          renderBase64: () =>
            generatePacketContentPdfBase64(
              packetContent,
              String(packet.userId ?? user.id),
              String(input.packetId)
            ),
        });
        const bytes = Buffer.from(base64Pdf, "base64");
        const pdfBody = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;

        await recordPacketDownload(input.packetId, user.id, packet.status ?? null);

        return new Response(pdfBody, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${filename}"`,
            "Content-Length": bytes.length.toString(),
          },
        });
      } catch {
        console.warn(`Falling back to stored packet PDF for packet ${input.packetId} after packet-content render failure.`);
      }
    }

    if (!packet.pdfStorageUrl) {
      return new Response(JSON.stringify({ error: "PDF not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const bytes = await readStoredPdf(packet.pdfStorageUrl);

    const pdfBody = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    await recordPacketDownload(input.packetId, user.id, packet.status ?? null);

    return new Response(pdfBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": bytes.length.toString(),
      },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
