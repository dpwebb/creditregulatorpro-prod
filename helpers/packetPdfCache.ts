import { createHash } from "node:crypto";

import { db } from "./db";
import { readStoredPdf, uploadPdf } from "./documentStorage";
import { chain } from "./hashChain";
import type { ParsedPacketContent } from "./packetPdfContent";

export type PacketPdfCachePurpose = "download" | "mail";

export const PACKET_PDF_CACHE_VERSION = "packet-pdf-cache-v1";
export const PACKET_PDF_RENDER_ATTEMPT_EVENT = "PACKET_PDF_RENDER_ATTEMPT";
export const PACKET_PDF_RENDER_SUCCEEDED_EVENT = "PACKET_PDF_RENDER_SUCCEEDED";
export const PACKET_PDF_RENDER_FAILED_EVENT = "PACKET_PDF_RENDER_FAILED";
export const PACKET_PDF_CACHE_HIT_EVENT = "PACKET_PDF_CACHE_HIT";

export type PacketPdfCacheKey = {
  cacheKey: string;
  objectName: string;
  storageUrl: string;
};

export type PacketPdfCacheResult = PacketPdfCacheKey & {
  base64Pdf: string;
  cacheHit: boolean;
};

type PacketPdfCacheInput = {
  packetId: number | string;
  userId: number | string;
  purpose: PacketPdfCachePurpose;
  packetContent: ParsedPacketContent;
};

type PacketPdfRenderInput = PacketPdfCacheInput & {
  renderBase64: () => Promise<string>;
};

function stableStringify(value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function buildPacketPdfCacheKey(input: PacketPdfCacheInput): PacketPdfCacheKey {
  const userId = String(input.userId);
  const packetId = String(input.packetId);
  const cachePayload = {
    version: PACKET_PDF_CACHE_VERSION,
    purpose: input.purpose,
    packetId,
    userId,
    packetContent: input.packetContent,
  };
  const cacheKey = createHash("sha256").update(stableStringify(cachePayload)).digest("hex");
  const objectName = `packet-pdfs/${userId}/${packetId}/${input.purpose}-${cacheKey}.pdf`;

  return {
    cacheKey,
    objectName,
    storageUrl: `local:${objectName}`,
  };
}

async function readCachedPdfBase64(storageUrl: string): Promise<string | null> {
  try {
    return (await readStoredPdf(storageUrl)).toString("base64");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function recordPacketPdfRenderEvent(input: {
  packetId: number;
  eventType:
    | typeof PACKET_PDF_RENDER_ATTEMPT_EVENT
    | typeof PACKET_PDF_RENDER_SUCCEEDED_EVENT
    | typeof PACKET_PDF_RENDER_FAILED_EVENT
    | typeof PACKET_PDF_CACHE_HIT_EVENT;
  purpose: PacketPdfCachePurpose;
  cacheKey: string;
}): Promise<void> {
  const now = new Date();
  const previousEvent = await db
    .selectFrom("evidenceEvent")
    .select("currentHash")
    .where("packetId", "=", input.packetId)
    .orderBy("at", "desc")
    .limit(1)
    .executeTakeFirst();
  const previousHash = previousEvent?.currentHash ?? null;
  const eventPayload = {
    packetId: input.packetId,
    eventType: input.eventType,
    purpose: input.purpose,
    cacheKey: input.cacheKey,
    timestamp: now.toISOString(),
    previousHash,
  };
  const description =
    input.eventType === PACKET_PDF_RENDER_ATTEMPT_EVENT
      ? `Packet PDF render attempted for ${input.purpose} cache ${input.cacheKey}.`
      : input.eventType === PACKET_PDF_RENDER_SUCCEEDED_EVENT
        ? `Packet PDF render succeeded for ${input.purpose} cache ${input.cacheKey}.`
        : input.eventType === PACKET_PDF_RENDER_FAILED_EVENT
          ? `Packet PDF render failed for ${input.purpose} cache ${input.cacheKey}.`
          : `Packet PDF cache hit for ${input.purpose} cache ${input.cacheKey}.`;

  await db
    .insertInto("evidenceEvent")
    .values({
      packetId: input.packetId,
      eventType: input.eventType,
      description,
      previousHash,
      currentHash: chain(previousHash ?? undefined, eventPayload),
      at: now,
      region: "CA",
    })
    .execute();
}

export async function getOrRenderPacketPdfBase64(input: PacketPdfRenderInput): Promise<PacketPdfCacheResult> {
  const cacheKey = buildPacketPdfCacheKey(input);
  const cachedBase64 = await readCachedPdfBase64(cacheKey.storageUrl);

  if (cachedBase64) {
    await recordPacketPdfRenderEvent({
      packetId: Number(input.packetId),
      eventType: PACKET_PDF_CACHE_HIT_EVENT,
      purpose: input.purpose,
      cacheKey: cacheKey.cacheKey,
    }).catch(() => undefined);
    return {
      ...cacheKey,
      base64Pdf: cachedBase64,
      cacheHit: true,
    };
  }

  const packetId = Number(input.packetId);
  await recordPacketPdfRenderEvent({
    packetId,
    eventType: PACKET_PDF_RENDER_ATTEMPT_EVENT,
    purpose: input.purpose,
    cacheKey: cacheKey.cacheKey,
  });

  try {
    const base64Pdf = await input.renderBase64();
    await uploadPdf(base64Pdf, cacheKey.objectName);
    await recordPacketPdfRenderEvent({
      packetId,
      eventType: PACKET_PDF_RENDER_SUCCEEDED_EVENT,
      purpose: input.purpose,
      cacheKey: cacheKey.cacheKey,
    });

    return {
      ...cacheKey,
      base64Pdf,
      cacheHit: false,
    };
  } catch (error) {
    await recordPacketPdfRenderEvent({
      packetId,
      eventType: PACKET_PDF_RENDER_FAILED_EVENT,
      purpose: input.purpose,
      cacheKey: cacheKey.cacheKey,
    });
    throw error;
  }
}
