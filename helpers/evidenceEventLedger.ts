import type { Selectable } from "kysely";

import { db } from "./db";
import { chain } from "./hashChain";
import type { EvidenceEvent } from "./schema";

type EvidenceLedgerExecutor = Pick<typeof db, "insertInto" | "selectFrom">;

export type EvidenceEventHashPayload = {
  packetId: number | null;
  eventType: string;
  description: string | null;
  statuteVersionId: number | null;
  organizationId: number | null;
  region: string;
  at: string | null;
};

export type AppendEvidenceEventInput = {
  packetId?: number | null;
  eventType: string;
  description?: string | null;
  statuteVersionId?: number | null;
  organizationId?: number | null;
  region?: string | null;
  at?: Date;
};

function timestampToIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function buildEvidenceEventHashPayload(input: {
  packetId?: number | null;
  eventType: string;
  description?: string | null;
  statuteVersionId?: number | null;
  organizationId?: number | null;
  region?: string | null;
  at?: Date | string | null;
}): EvidenceEventHashPayload {
  return {
    packetId: input.packetId ?? null,
    eventType: input.eventType,
    description: input.description ?? null,
    statuteVersionId: input.statuteVersionId ?? null,
    organizationId: input.organizationId ?? null,
    region: input.region ?? "CA",
    at: timestampToIso(input.at),
  };
}

export async function appendEvidenceEvent(
  input: AppendEvidenceEventInput,
  executor: EvidenceLedgerExecutor = db,
): Promise<Selectable<EvidenceEvent>> {
  const at = input.at ?? new Date();
  const region = input.region ?? "CA";

  const lastEvent = await executor
    .selectFrom("evidenceEvent")
    .select(["currentHash"])
    .orderBy("id", "desc")
    .limit(1)
    .forUpdate()
    .executeTakeFirst();

  const previousHash = lastEvent?.currentHash || "GENESIS";
  const hashPayload = buildEvidenceEventHashPayload({
    packetId: input.packetId ?? null,
    eventType: input.eventType,
    description: input.description ?? null,
    statuteVersionId: input.statuteVersionId ?? null,
    organizationId: input.organizationId ?? null,
    region,
    at,
  });

  return executor
    .insertInto("evidenceEvent")
    .values({
      packetId: input.packetId ?? null,
      eventType: input.eventType,
      description: input.description ?? null,
      statuteVersionId: input.statuteVersionId ?? null,
      previousHash,
      currentHash: chain(previousHash, hashPayload),
      organizationId: input.organizationId ?? null,
      region,
      at,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
