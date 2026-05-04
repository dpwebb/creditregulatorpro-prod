import { OutputType, schema } from "./impact_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const packetIdParam = url.searchParams.get("packetId");

    const parsed = schema.parse({ packetId: packetIdParam ? Number(packetIdParam) : undefined });

    // Fetch the packet
    const packet = await db
      .selectFrom("packet")
      .where("id", "=", parsed.packetId)
      .select([
        "id",
        "userId",
        "tradelineId",
        "status",
        "baselineSnapshotId",
        "createdAt",
      ])
      .executeTakeFirst();

    if (!packet) {
      return new Response(JSON.stringify({
        assessment: null,
        packet: null,
        baselineSnapshot: null,
        followupSnapshot: null,
      } satisfies OutputType));
    }

    if (user.role !== "admin" && packet.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized access to packet impact" }), { status: 403 });
    }

    // Fetch the assessment
    const assessment = await db
      .selectFrom("packetImpactAssessment")
      .where("packetId", "=", parsed.packetId)
      .selectAll()
      .executeTakeFirst() || null;

    // Fetch snapshots
    let baselineSnapshot = null;
    let followupSnapshot = null;

    if (packet.baselineSnapshotId) {
      baselineSnapshot = await db
        .selectFrom("tradelineSnapshot")
        .where("id", "=", packet.baselineSnapshotId)
        .selectAll()
        .executeTakeFirst() || null;
    }

    if (assessment?.followupSnapshotId) {
      followupSnapshot = await db
        .selectFrom("tradelineSnapshot")
        .where("id", "=", assessment.followupSnapshotId)
        .selectAll()
        .executeTakeFirst() || null;
    }

    return new Response(JSON.stringify({
      assessment,
      packet: {
        id: packet.id,
        tradelineId: packet.tradelineId,
        status: packet.status,
        baselineSnapshotId: packet.baselineSnapshotId,
        createdAt: packet.createdAt,
      },
      baselineSnapshot,
      followupSnapshot,
    } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
