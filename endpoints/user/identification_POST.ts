import { schema, OutputType } from "./identification_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { saveConsumerIdentificationDocument } from "../../helpers/consumerIdentification";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";
import {
  CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
  isUploadRequestContentLengthTooLarge,
  isUploadRequestTextTooLarge,
  uploadRequestTooLargeResponse,
} from "../../helpers/uploadPayloadValidation";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (isUploadRequestContentLengthTooLarge(request, CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Identification image", CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES);
    }

    const text = await request.text();
    if (isUploadRequestTextTooLarge(text, CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES)) {
      return uploadRequestTooLargeResponse("Identification image", CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES);
    }

    const input = schema.parse(JSON.parse(text));

    const identification = await saveConsumerIdentificationDocument({
      userId: user.id,
      fileName: input.fileName,
      fileType: input.fileType,
      fileDataBase64: input.fileDataBase64,
    });

    await logAudit({
      action: "UPLOAD",
      entityType: "USER_ACCOUNT",
      entityId: user.id,
      userId: user.id,
      details: {
        documentType: "consumer_identification",
        fileName: identification.fileName,
        fileType: identification.fileType,
        fileSizeBytes: identification.fileSizeBytes,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ identification } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
