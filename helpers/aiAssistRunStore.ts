import { createHash } from "node:crypto";

import { sql } from "kysely";

import { db } from "./db";

export type AiAssistRunStatus = "disabled" | "unavailable" | "ok" | "failed";

export interface AiAssistRunRecord {
  featureKey: string;
  subjectType: string;
  subjectId?: number | null;
  userId?: number | null;
  provider: string;
  model?: string | null;
  status: AiAssistRunStatus;
  input: unknown;
  outputJson?: unknown;
  errorCode?: string | null;
}

let ensurePromise: Promise<void> | null = null;

export function hashAiAssistInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
}

export function ensureAiAssistRunSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.ai_assist_run (
          id bigserial primary key,
          feature_key text not null,
          subject_type text not null,
          subject_id bigint null,
          user_id bigint null references public.users(id) on delete set null,
          provider text not null,
          model text null,
          status text not null,
          input_hash text not null,
          output_json jsonb null,
          error_code text null,
          created_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create index if not exists idx_ai_assist_run_feature_created
          on public.ai_assist_run(feature_key, created_at desc)
      `.execute(db);

      await sql`
        create index if not exists idx_ai_assist_run_subject
          on public.ai_assist_run(subject_type, subject_id)
      `.execute(db);
    })();
  }

  return ensurePromise;
}

export async function recordAiAssistRun(params: AiAssistRunRecord): Promise<void> {
  try {
    await ensureAiAssistRunSchema();

    const outputJson =
      params.outputJson === undefined
        ? sql`null`
        : sql`${JSON.stringify(params.outputJson)}::jsonb`;

    await sql`
      insert into public.ai_assist_run (
        feature_key,
        subject_type,
        subject_id,
        user_id,
        provider,
        model,
        status,
        input_hash,
        output_json,
        error_code
      )
      values (
        ${params.featureKey},
        ${params.subjectType},
        ${params.subjectId ?? null},
        ${params.userId ?? null},
        ${params.provider},
        ${params.model ?? null},
        ${params.status},
        ${hashAiAssistInput(params.input)},
        ${outputJson},
        ${params.errorCode ?? null}
      )
    `.execute(db);
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "WARN",
        component: "aiAssistRunStore",
        message: "Failed to record AI assist run",
        featureKey: params.featureKey,
        subjectType: params.subjectType,
        subjectId: params.subjectId ?? null,
        status: params.status,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
