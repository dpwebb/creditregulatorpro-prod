import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureViolationCorrectionSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.violation_correction (
          id bigserial primary key,
          extraction_run_id bigint not null references public.pass_extraction(id) on delete cascade,
          tradeline_id bigint not null references public.tradeline(id) on delete cascade,
          original_violation_id bigint null references public.creditor_obligation_test(id) on delete set null,
          correction_action text not null,
          corrected_violation_type text null,
          corrected_summary text null,
          corrected_explanation text null,
          corrected_severity text null,
          corrected_confidence numeric null,
          correction_reason text null,
          admin_notes text null,
          status text not null default 'draft',
          training_label text null,
          training_note_only boolean not null default false,
          use_for_training boolean not null default true,
          created_by_admin_id bigint not null references public.users(id) on delete restrict,
          finalized_by_admin_id bigint null references public.users(id) on delete set null,
          final_reviewed_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create table if not exists public.violation_correction_evidence (
          id bigserial primary key,
          correction_id bigint not null references public.violation_correction(id) on delete cascade,
          source_document_id bigint not null references public.report_artifact(id) on delete cascade,
          extraction_run_id bigint not null references public.pass_extraction(id) on delete cascade,
          tradeline_id bigint not null references public.tradeline(id) on delete cascade,
          page_number integer not null,
          field_name text null,
          text_excerpt text not null,
          normalized_value text null,
          evidence_reason text not null,
          admin_selected boolean not null default true,
          created_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create table if not exists public.violation_regulation_reference (
          id bigserial primary key,
          violation_id bigint null references public.creditor_obligation_test(id) on delete set null,
          correction_id bigint null references public.violation_correction(id) on delete cascade,
          extraction_run_id bigint not null references public.pass_extraction(id) on delete cascade,
          tradeline_id bigint null references public.tradeline(id) on delete set null,
          jurisdiction text not null,
          country text not null default 'Canada',
          province_or_territory text null,
          regulator_or_standard_body text not null,
          regulation_name text not null,
          statute_or_rule_name text not null,
          section_number text not null,
          subsection_number text null,
          regulation_text_excerpt text not null,
          citation_url text null,
          citation_source text not null,
          citation_confidence numeric not null default 0.75,
          admin_verified_citation boolean not null default false,
          admin_notes text null,
          mapping_status text not null default 'active',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create table if not exists public.violation_training_example (
          id bigserial primary key,
          correction_id bigint not null references public.violation_correction(id) on delete cascade,
          input_context_json jsonb not null,
          expected_output_json jsonb not null,
          regulation_mapping_json jsonb not null default '[]'::jsonb,
          label text not null,
          use_for_training boolean not null default true,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique(correction_id)
        )
      `.execute(db);

      await sql`
        alter table public.violation_correction
          add column if not exists training_label text null,
          add column if not exists training_note_only boolean not null default false,
          add column if not exists use_for_training boolean not null default true,
          add column if not exists finalized_by_admin_id bigint null references public.users(id) on delete set null,
          add column if not exists final_reviewed_at timestamptz null
      `.execute(db);

      await sql`
        alter table public.violation_correction_evidence
          add column if not exists extraction_run_id bigint null references public.pass_extraction(id) on delete cascade,
          add column if not exists tradeline_id bigint null references public.tradeline(id) on delete cascade,
          add column if not exists admin_selected boolean not null default true
      `.execute(db);

      await sql`
        alter table public.violation_regulation_reference
          add column if not exists mapping_status text not null default 'active'
      `.execute(db);

      await sql`
        create index if not exists idx_violation_correction_run on public.violation_correction(extraction_run_id)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_correction_tradeline on public.violation_correction(tradeline_id)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_correction_original on public.violation_correction(original_violation_id)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_correction_status on public.violation_correction(status)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_correction_evidence_correction on public.violation_correction_evidence(correction_id)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_regulation_reference_correction on public.violation_regulation_reference(correction_id)
      `.execute(db);
      await sql`
        create index if not exists idx_violation_training_example_correction on public.violation_training_example(correction_id)
      `.execute(db);
    })();
  }

  return ensurePromise;
}
