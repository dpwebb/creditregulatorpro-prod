import { schema, OutputType } from "./upload_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { uploadEvidence } from "../../helpers/evidenceManager";
import { uploadFile } from "../../helpers/gcsStorage";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 10 uploads/hour (60 minutes)
    const rateLimit = await checkRateLimit(user.id.toString(), "EVIDENCE_UPLOAD_POST", 10, 60);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Upload limit reached. Please try again later." }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const { obligationInstanceId, packetId, fileName, fileType, fileDataBase64, description } = schema.parse(json);

    const isAdmin = user.role === "admin";

    // Verify ownership of the referenced resource before uploading
    if (obligationInstanceId !== undefined) {
      const ownerCheck = await db
        .selectFrom("obligationInstance")
        .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
        .select(["tradeline.userId"])
        .where("obligationInstance.id", "=", obligationInstanceId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Obligation instance not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this obligation instance." }), { status: 403 });
      }
    }

    if (packetId !== undefined) {
      const ownerCheck = await db
        .selectFrom("packet")
        .select(["userId"])
        .where("id", "=", packetId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Packet not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this packet." }), { status: 403 });
      }
    }

    // Calculate file size roughly from base64 string
    const base64Data = fileDataBase64.includes(",") ? fileDataBase64.split(",")[1] : fileDataBase64;
    const paddingCount = (base64Data.match(/=+$/) ?? [""])[0].length;
    const fileSizeBytes = Math.ceil((base64Data.length * 3) / 4) - paddingCount;

    // Upload file to GCS; object path scoped by userId and timestamped to avoid collisions
    const timestamp = Date.now();
    const objectName = `evidence/${user.id}/${timestamp}-${fileName}`;
    console.log(`Uploading evidence attachment to GCS: ${objectName}`);
    const storageUrl = await uploadFile(fileDataBase64, objectName, fileType);

    const attachment = await uploadEvidence({
      obligationInstanceId,
      packetId,
      fileName,
      fileType,
      fileSizeBytes,
      storageUrl,
      description,
      uploadedBy: user.id,
      region: "CA",
    });

    // Audit Log
    await logAudit({
      action: "UPLOAD",
      entityType: "EVIDENCE_EVENT", // Closest match
      entityId: attachment.id,
      userId: user.id,
      details: { fileName, fileType, size: fileSizeBytes },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ attachment } satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}