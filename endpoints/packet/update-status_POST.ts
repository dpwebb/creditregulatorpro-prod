import { schema, OutputType } from "./update-status_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const packet = await db
      .selectFrom("packet")
      .leftJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .select([
        "packet.id",
        "packet.userId",
        "tradeline.userId as tradelineUserId",
      ])
      .where("packet.id", "=", result.packetId)
      .executeTakeFirst();

    if (!packet) {
      throw new BusinessRuleError("Packet not found", 404);
    }

    const isOwner =
      packet.userId === user.id || packet.tradelineUserId === user.id;

    if (user.role !== "admin" && !isOwner) {
      throw new BusinessRuleError("Unauthorized access to packet", 403);
    }

    const updateFields: Record<string, string> = { status: result.status };
    if (result.recipientName !== undefined) updateFields.recipientName = result.recipientName;
    if (result.recipientAddressLine1 !== undefined) updateFields.recipientAddressLine1 = result.recipientAddressLine1;
    if (result.recipientAddressLine2 !== undefined) updateFields.recipientAddressLine2 = result.recipientAddressLine2;
    if (result.recipientCity !== undefined) updateFields.recipientCity = result.recipientCity;
    if (result.recipientProvince !== undefined) updateFields.recipientProvince = result.recipientProvince;
    if (result.recipientPostalCode !== undefined) updateFields.recipientPostalCode = result.recipientPostalCode;

    await db
      .updateTable("packet")
      .set(updateFields)
      .where("id", "=", result.packetId)
      .execute();

    const output: OutputType = {
      success: true,
      packetId: result.packetId,
      status: result.status,
      ...(result.recipientName !== undefined && { recipientName: result.recipientName }),
      ...(result.recipientAddressLine1 !== undefined && { recipientAddressLine1: result.recipientAddressLine1 }),
      ...(result.recipientAddressLine2 !== undefined && { recipientAddressLine2: result.recipientAddressLine2 }),
      ...(result.recipientCity !== undefined && { recipientCity: result.recipientCity }),
      ...(result.recipientProvince !== undefined && { recipientProvince: result.recipientProvince }),
      ...(result.recipientPostalCode !== undefined && { recipientPostalCode: result.recipientPostalCode }),
    };

    return new Response(
      JSON.stringify(output satisfies OutputType),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}