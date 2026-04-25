import { schema, OutputType } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { resolvePdfStorageUrl } from "../../helpers/gcsStorage";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams);
    
    // Validate input using schema
    // Since it's GET, we parse from searchParams. 
    // Note: searchParams values are strings, so we might need to coerce packetId if schema expects number.
    // However, zod's coerce.number() handles string -> number conversion.
    const input = schema.parse(searchParams);

    const packet = await db
      .selectFrom('packet')
      .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId')
      .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
      .select([
        'packet.id',
        'packet.status',
        'packet.terminalLabel',
        'packet.createdAt',
        'packet.pdfStorageUrl',
        'packet.sentDate',
        'packet.deliveryMethod',
        'packet.trackingNumber',
        'packet.letterDate',
        'packet.consumerCertification',
        'packet.recipientName',
        'packet.userId',
        'tradeline.accountNumber as tradelineAccountNumber',
        'bureau.name as bureauName'
      ])
      .where('packet.id', '=', input.packetId)
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
    }

    // Check authorization
    if (user.role !== 'admin' && packet.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to packet" }), { status: 403 });
    }

    // Remove userId from output to match OutputType and avoid leaking internal IDs if not needed
    const { userId, ...safePacket } = packet;

    // Resolve pdfStorageUrl: converts gcs: paths to signed URLs, passes through legacy base64 unchanged
    const resolvedPdfStorageUrl = await resolvePdfStorageUrl(safePacket.pdfStorageUrl ?? null);

    return new Response(JSON.stringify({ packet: { ...safePacket, pdfStorageUrl: resolvedPdfStorageUrl } } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}