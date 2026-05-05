import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureParserTestAdjudicationSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        alter table public.parser_test_case
          add column if not exists bureau text null,
          add column if not exists parser_mode text null,
          add column if not exists allow_ai_fallback boolean null,
          add column if not exists stage_version text null,
          add column if not exists extraction_source text null,
          add column if not exists parser_context jsonb not null default '{}'::jsonb,
          add column if not exists admin_review_status text not null default 'needs_review',
          add column if not exists approved_consumer_info jsonb null,
          add column if not exists approved_tradelines jsonb null default '[]'::jsonb,
          add column if not exists adjudication_decisions jsonb not null default '[]'::jsonb
      `.execute(db);
    })();
  }

  return ensurePromise;
}
