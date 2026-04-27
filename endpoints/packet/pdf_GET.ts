import { schema } from "./pdf_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { generateSignedUrl } from "../../helpers/gcsStorage";
import { buildPacketPdfFilename } from "../../helpers/packetFileNaming";

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

    if (!packet.pdfStorageUrl) {
      return new Response(JSON.stringify({ error: "PDF not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
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

    if (packet.pdfStorageUrl.startsWith("gcs:")) {
      const objectName = packet.pdfStorageUrl.substring(4);
      const signedUrl = await generateSignedUrl(objectName);
      
      const fileResponse = await fetch(signedUrl);
      if (!fileResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to read file from storage" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      
      return new Response(fileResponse.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    } else {
      // Legacy base64
      const base64Data = packet.pdfStorageUrl.includes(",") 
        ? packet.pdfStorageUrl.split(",")[1] 
        : packet.pdfStorageUrl;
        
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": bytes.length.toString(),
        },
      });
    }
  } catch (error) {
    return handleEndpointError(error);
  }
}