import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureParserRulePromotionSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.parser_rule_candidate (
          id serial primary key,
          test_case_id integer not null references public.parser_test_case(id) on delete cascade,
          decision_id text not null,
          bureau text null,
          parser_mode text null,
          stage_version text null,
          entity_type text not null,
          entity_key text null,
          field_path text not null,
          parsed_value jsonb null,
          approved_value jsonb null,
          source_evidence text null,
          parser_instruction text null,
          rule_type text not null,
          rule_config jsonb not null default '{}'::jsonb,
          status text not null default 'candidate',
          validation_summary jsonb null,
          activated_rule_id integer null,
          created_by integer null references public.users(id) on delete set null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create table if not exists public.parser_extraction_rule (
          id serial primary key,
          bureau text not null,
          rule_type text not null,
          field_path text not null,
          target_field text not null,
          config jsonb not null default '{}'::jsonb,
          is_active boolean not null default true,
          priority integer not null default 0,
          description text null,
          created_from_candidate_id integer null references public.parser_rule_candidate(id) on delete set null,
          created_by integer null references public.users(id) on delete set null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create index if not exists parser_rule_candidate_test_case_idx
          on public.parser_rule_candidate(test_case_id)
      `.execute(db);

      await sql`
        create index if not exists parser_extraction_rule_active_idx
          on public.parser_extraction_rule(bureau, rule_type, is_active)
      `.execute(db);

      await sql`
        alter table public.parser_rule_candidate
          add constraint parser_rule_candidate_status_check
          check (status in ('candidate', 'blocked', 'validated', 'activated', 'failed_validation', 'failed_regression'))
      `.execute(db).catch((error) => {
        if (!String(error).includes("already exists")) throw error;
      });
    })();
  }

  return ensurePromise;
}
