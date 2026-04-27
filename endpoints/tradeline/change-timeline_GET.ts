import { OutputType, schema, TimelineEntry } from "./change-timeline_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const tradelineIdParam = url.searchParams.get("tradelineId");

    const parsed = schema.parse({ tradelineId: tradelineIdParam ? Number(tradelineIdParam) : undefined });
    const tradelineId = parsed.tradelineId;

    // Verify tradeline ownership for non-admin users
    const isAdmin = user.role === "admin" || user.role === "support";
    const tradeline = await db
      .selectFrom("tradeline")
      .select(["id", "userId"])
      .where("id", "=", tradelineId)
      .executeTakeFirst();

    if (!tradeline) {
      throw new BusinessRuleError("Tradeline not found", 404);
    }

    if (!isAdmin && tradeline.userId !== user.id) {
      throw new BusinessRuleError("Not authorized", 403);
    }

    const timeline: TimelineEntry[] = [];

    // 1. Snapshots
    const snapshots = await db
      .selectFrom("tradelineSnapshot")
      .where("tradelineId", "=", tradelineId)
      .select(["id", "snapshotAt", "reportArtifactId"])
      .execute();

    snapshots.forEach(s => {
      if (s.snapshotAt) {
        timeline.push({
          id: `snapshot_${s.id}`,
          type: "SNAPSHOT",
          timestamp: new Date(s.snapshotAt).toISOString(),
          data: {
            id: s.id,
            reportArtifactId: s.reportArtifactId,
          }
        });
      }
    });

    // 2. Packets
    const packets = await db
      .selectFrom("packet")
      .where("tradelineId", "=", tradelineId)
      .select(["id", "createdAt", "status", "terminalLabel", "baselineSnapshotId"])
      .execute();

    packets.forEach(p => {
      if (p.createdAt) {
        timeline.push({
          id: `packet_${p.id}`,
          type: "PACKET",
          timestamp: new Date(p.createdAt).toISOString(),
          data: {
            id: p.id,
            status: p.status,
            terminalLabel: p.terminalLabel,
            baselineSnapshotId: p.baselineSnapshotId,
          }
        });
      }
    });

    // 3. Drift Logs
    const drifts = await db
      .selectFrom("obligationChallengeLog")
      .where("tradelineId", "=", tradelineId)
      .select([
        "id", "detectedAt", "fieldName", "severity",
        "expectedValue", "actualValue", "packetId",
        "sourceSnapshotId", "comparisonSnapshotId"
      ])
      .execute();

    drifts.forEach(d => {
      if (d.detectedAt) {
        timeline.push({
          id: `drift_${d.id}`,
          type: "DRIFT",
          timestamp: new Date(d.detectedAt).toISOString(),
          data: {
            id: d.id,
            fieldName: d.fieldName,
            severity: d.severity,
            expectedValue: d.expectedValue,
            actualValue: d.actualValue,
            packetId: d.packetId,
            sourceSnapshotId: d.sourceSnapshotId,
            comparisonSnapshotId: d.comparisonSnapshotId,
          }
        });
      }
    });

    // 4. Impact Assessments
    const impacts = await db
      .selectFrom("packetImpactAssessment")
      .where("tradelineId", "=", tradelineId)
      .select([
        "id", "assessedAt", "packetId", "impactScore",
        "favorableChanges", "unfavorableChanges", "totalFieldsChanged"
      ])
      .execute();

    impacts.forEach(i => {
      if (i.assessedAt) {
        timeline.push({
          id: `impact_${i.id}`,
          type: "IMPACT",
          timestamp: new Date(i.assessedAt).toISOString(),
          data: {
            id: i.id,
            packetId: i.packetId,
            impactScore: i.impactScore,
            favorableChanges: i.favorableChanges,
            unfavorableChanges: i.unfavorableChanges,
            totalFieldsChanged: i.totalFieldsChanged,
          }
        });
      }
    });

    // 5. Evidence Events
    const evidences = await db
      .selectFrom("evidenceEvent")
      .innerJoin("packet", "packet.id", "evidenceEvent.packetId")
      .where("packet.tradelineId", "=", tradelineId)
      .select([
        "evidenceEvent.id", "evidenceEvent.at",
        "evidenceEvent.eventType", "evidenceEvent.description",
        "evidenceEvent.packetId"
      ])
      .execute();

    evidences.forEach(e => {
      if (e.at) {
        timeline.push({
          id: `evidence_${e.id}`,
          type: "EVIDENCE",
          timestamp: new Date(e.at).toISOString(),
          data: {
            id: e.id,
            eventType: e.eventType,
            description: e.description,
            packetId: e.packetId,
          }
        });
      }
    });

    // 6. Obligation Instances
    const obligations = await db
      .selectFrom("obligationInstance")
      .where("tradelineId", "=", tradelineId)
      .select(["id", "createdAt", "state", "disputeVector", "pressureScore"])
      .execute();

    obligations.forEach(o => {
      if (o.createdAt) {
        timeline.push({
          id: `obligation_${o.id}`,
          type: "OBLIGATION",
          timestamp: new Date(o.createdAt).toISOString(),
          data: {
            id: o.id,
            state: o.state,
            disputeVector: o.disputeVector,
            pressureScore: o.pressureScore,
          }
        });
      }
    });

    // Sort by timestamp DESC
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return new Response(JSON.stringify({ timeline } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}