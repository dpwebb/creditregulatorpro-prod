import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureOutcomeTrackingSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.outcome_comparison_run (
          id bigserial primary key,
          user_id bigint not null,
          previous_report_artifact_id bigint not null,
          later_report_artifact_id bigint null,
          packet_id bigint null,
          bureau_id bigint null,
          comparison_scope text not null,
          status text not null default 'pending',
          source_version text not null default 'outcome-comparison-v1',
          warnings jsonb not null default '[]'::jsonb,
          created_by bigint null,
          started_at timestamptz not null default now(),
          completed_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint outcome_comparison_run_scope_check
            check (comparison_scope in ('report_to_report', 'packet_findings', 'response_only')),
          constraint outcome_comparison_run_status_check
            check (status in ('pending', 'completed', 'needs_review', 'failed', 'archived')),
          constraint outcome_comparison_run_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint outcome_comparison_run_previous_report_artifact_id_fkey
            foreign key (previous_report_artifact_id) references public.report_artifact(id) on delete cascade,
          constraint outcome_comparison_run_later_report_artifact_id_fkey
            foreign key (later_report_artifact_id) references public.report_artifact(id) on delete set null,
          constraint outcome_comparison_run_packet_id_fkey
            foreign key (packet_id) references public.packet(id) on delete set null,
          constraint outcome_comparison_run_bureau_id_fkey
            foreign key (bureau_id) references public.bureau(id) on delete set null,
          constraint outcome_comparison_run_created_by_fkey
            foreign key (created_by) references public.users(id) on delete set null
        )
      `.execute(db);

      await sql`
        create table if not exists public.finding_outcome (
          id bigserial primary key,
          comparison_run_id bigint not null,
          user_id bigint not null,
          dispute_packet_id bigint null,
          dispute_packet_finding_id bigint null,
          creditor_obligation_test_id bigint null,
          previous_tradeline_id bigint null,
          later_tradeline_id bigint null,
          outcome_type text not null,
          confidence_level text not null,
          matching_method text not null,
          outcome_reason_codes jsonb not null default '[]'::jsonb,
          previous_snapshot jsonb null,
          later_snapshot jsonb null,
          evidence_ids jsonb not null default '[]'::jsonb,
          evidence_location_snapshot jsonb not null default '[]'::jsonb,
          response_deadline_at timestamptz null,
          response_received_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint finding_outcome_type_check
            check (outcome_type in ('corrected', 'removed', 'unchanged', 'reinserted', 'partially_corrected', 'new_issue', 'unresolved', 'needs_review', 'not_comparable', 'response_received')),
          constraint finding_outcome_confidence_level_check
            check (confidence_level in ('high', 'medium', 'low', 'none')),
          constraint finding_outcome_matching_method_check
            check (matching_method in ('exact_account_creditor_date', 'stable_secondary_keys', 'packet_finding_tradeline', 'response_only', 'ambiguous', 'not_comparable', 'none')),
          constraint finding_outcome_comparison_run_id_fkey
            foreign key (comparison_run_id) references public.outcome_comparison_run(id) on delete cascade,
          constraint finding_outcome_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint finding_outcome_dispute_packet_id_fkey
            foreign key (dispute_packet_id) references public.packet(id) on delete set null,
          constraint finding_outcome_dispute_packet_finding_id_fkey
            foreign key (dispute_packet_finding_id) references public.dispute_packet_findings(id) on delete set null,
          constraint finding_outcome_creditor_obligation_test_id_fkey
            foreign key (creditor_obligation_test_id) references public.creditor_obligation_test(id) on delete set null,
          constraint finding_outcome_previous_tradeline_id_fkey
            foreign key (previous_tradeline_id) references public.tradeline(id) on delete set null,
          constraint finding_outcome_later_tradeline_id_fkey
            foreign key (later_tradeline_id) references public.tradeline(id) on delete set null
        )
      `.execute(db);

      await sql`
        create index if not exists idx_outcome_comparison_run_user_created_at
          on public.outcome_comparison_run(user_id, created_at desc)
      `.execute(db);
      await sql`
        create index if not exists idx_outcome_comparison_run_previous_report_artifact_id
          on public.outcome_comparison_run(previous_report_artifact_id)
      `.execute(db);
      await sql`
        create index if not exists idx_outcome_comparison_run_later_report_artifact_id
          on public.outcome_comparison_run(later_report_artifact_id)
      `.execute(db);
      await sql`
        create index if not exists idx_outcome_comparison_run_packet_id
          on public.outcome_comparison_run(packet_id)
      `.execute(db);
      await sql`
        create index if not exists idx_outcome_comparison_run_status
          on public.outcome_comparison_run(status)
      `.execute(db);
      await sql`
        create index if not exists idx_outcome_comparison_run_comparison_scope
          on public.outcome_comparison_run(comparison_scope)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_comparison_run_id
          on public.finding_outcome(comparison_run_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_user_created_at
          on public.finding_outcome(user_id, created_at desc)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_dispute_packet_id
          on public.finding_outcome(dispute_packet_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_dispute_packet_finding_id
          on public.finding_outcome(dispute_packet_finding_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_creditor_obligation_test_id
          on public.finding_outcome(creditor_obligation_test_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_previous_tradeline_id
          on public.finding_outcome(previous_tradeline_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_later_tradeline_id
          on public.finding_outcome(later_tradeline_id)
      `.execute(db);
      await sql`
        create index if not exists idx_finding_outcome_outcome_type
          on public.finding_outcome(outcome_type)
      `.execute(db);
    })();
  }

  return ensurePromise;
}
