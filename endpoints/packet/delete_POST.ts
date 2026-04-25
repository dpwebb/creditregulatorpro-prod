import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Check ownership for non-admin users
    if (user.role !== 'admin') {
      const packet = await db
        .selectFrom('packet')
        .select('userId')
        .where('id', '=', input.id)
        .executeTakeFirst();

      if (!packet) {
        return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
      }

      if (packet.userId !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
      }
    }

    const deletedPacket = await db.transaction().execute(async (trx) => {
      console.log(`Deleting related records for packet ${input.id}`);

      await trx
        .deleteFrom('obligationChallengeLog')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('packetImpactAssessment')
        .where('packetId', '=', input.id)
        .execute();

      // Find obligation instances linked to this packet via notes pattern
      const linkedObligationInstances = await trx
        .selectFrom('obligationInstance')
        .select('id')
        .where('notes', 'like', `Packet #${input.id} %`)
        .execute();
      const linkedObligationInstanceIds = linkedObligationInstances.map((o) => o.id);
      console.log(`Found ${linkedObligationInstanceIds.length} obligation instances linked to packet ${input.id}:`, linkedObligationInstanceIds);

      if (linkedObligationInstanceIds.length > 0) {
        // Delete success_metric records before deleting obligation instances
                await trx
        .deleteFrom('successMetric')
        .where('obligationInstanceId', 'in', linkedObligationInstanceIds)
        .execute();
        console.log(`Deleted success metrics for linked obligation instances`);

        // Delete the obligation instances (DB CASCADE handles deadline_event, evidence_attachment for obligation_instance FK)
        await trx
        .deleteFrom('obligationInstance')
        .where('id', 'in', linkedObligationInstanceIds)
        .execute();
        console.log(`Deleted obligation instances linked to packet ${input.id}`);
      }

      await trx
        .deleteFrom('postalTransaction')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('discriminationClaim')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('packetComplianceAudit')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('evidenceAttachment')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('deadlineEvent')
        .where('packetId', '=', input.id)
        .execute();

      await trx
        .deleteFrom('evidenceEvent')
        .where('packetId', '=', input.id)
        .execute();

      console.log(`Deleting packet ${input.id}`);

      return trx
        .deleteFrom('packet')
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirst();
    });

    if (!deletedPacket) {
      return new Response(JSON.stringify({ error: "Packet not found" }), { status: 404 });
    }

    console.log(`Successfully deleted packet ${input.id}`);

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}