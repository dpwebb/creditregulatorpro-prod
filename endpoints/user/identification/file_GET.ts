import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { readConsumerIdentificationFile } from "../../../helpers/consumerIdentification";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const file = await readConsumerIdentificationFile(user.id);

    if (!file) {
      return new Response(JSON.stringify({ error: "Identification image not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": file.fileType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Content-Length": file.bytes.length.toString(),
      },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
