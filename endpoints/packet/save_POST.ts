import { schema, OutputType } from "./save_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { uploadPdf } from "../../helpers/documentStorage";
import { assertCreditorObligationPacketReady } from "../../helpers/packetViolationConfidenceGuard";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const isAdmin = user.role === "admin";

    // Verify tradeline ownership before saving the packet
    const tradelineOwnerCheck = await db
      .selectFrom("tradeline")
      .select(["userId"])
      .where("id", "=", input.tradelineId)
      .executeTakeFirst();

    if (!tradelineOwnerCheck) {
      return new Response(
        JSON.stringify({ error: "Tradeline not found." }),
        { status: 404 }
      );
    }

    if (!isAdmin && tradelineOwnerCheck.userId !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not have access to this tradeline." }),
        { status: 403 }
      );
    }

    await assertCreditorObligationPacketReady({
      creditorObligationTestId: input.creditorObligationTestId,
      tradelineId: input.tradelineId,
      userId: user.id,
      isAdmin,
    });

    // Insert packet without pdfStorageUrl first to obtain the packet ID
    const newPacket = await db
      .insertInto("packet")
      .values({
        tradelineId: input.tradelineId,
        bureauId: input.bureauId ?? null,
        status: input.status,
        terminalLabel: input.terminalLabel ?? null,
        content: input.content,
        pdfStorageUrl: null,
        creditorObligationTestId: input.creditorObligationTestId ?? null,
        signatureMode: input.signatureMode ?? null,
        type: input.type ?? null,
        userId: user.id,
        letterDate: new Date(),
        createdAt: new Date(),
        region: "CA",
        recipientName: input.recipientName ?? null,
        recipientAddressLine1: input.recipientAddressLine1 ?? null,
        recipientAddressLine2: input.recipientAddressLine2 ?? null,
        recipientCity: input.recipientCity ?? null,
        recipientProvince: input.recipientProvince ?? null,
        recipientPostalCode: input.recipientPostalCode ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Store the preview PDF now that we have the packet ID
    const storageObjectName = `packets/${newPacket.id}.pdf`;
    const pdfStorageUrl = await uploadPdf(input.pdfStorageUrl, storageObjectName);
    console.log(`PDF stored for saved packet ${newPacket.id}`);

    // Update the packet record with the storage path
    await db
      .updateTable("packet")
      .set({ pdfStorageUrl })
      .where("id", "=", newPacket.id)
      .execute();

    const savedPacket = { ...newPacket, pdfStorageUrl };

    return new Response(
      JSON.stringify({ packet: savedPacket } satisfies OutputType)
    );
  } catch (error) {
    console.error("Error in packet/save_POST:", error);
    return handleEndpointError(error);
  }
}
