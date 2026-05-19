import { sql } from "kysely";
import { db } from "./db";
import { ensureDisputePacketFindingsSchema } from "./disputePacketFindingsSchema";
import { ensureOutcomeTrackingSchema } from "./outcomeTrackingSchema";

let ensurePromise: Promise<void> | null = null;

export function ensureResponseDocumentSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`select pg_advisory_lock(hashtext('creditregulatorpro.response_document_schema'))`.execute(db);
      try {
        await ensureDisputePacketFindingsSchema();
        await ensureOutcomeTrackingSchema();

        await sql`
        create table if not exists public.bureau_response_event (
          id bigserial primary key,
          user_id bigint not null,
          packet_id bigint null,
          dispute_packet_finding_id bigint null,
          finding_outcome_id bigint null,
          comparison_run_id bigint null,
          bureau_id bigint null,
          agency_id bigint null,
          response_channel text not null,
          response_document_type text not null,
          response_received_at timestamptz not null,
          response_source text not null default 'manual_record',
          response_subject text null,
          response_sender_domain text null,
          response_reference_id text null,
          attachment_evidence_id bigint null,
          evidence_attachment_id bigint null,
          normalized_response_hash text null,
          response_summary text null,
          response_status text not null default 'received',
          created_by bigint null,
          reviewed_by bigint null,
          reviewed_at timestamptz null,
          review_notes text null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint bureau_response_event_channel_check
            check (response_channel in ('email', 'mail', 'portal', 'phone_note', 'uploaded_document', 'manual_record', 'unknown')),
          constraint bureau_response_event_document_type_check
            check (response_document_type in ('bureau_email_response', 'bureau_letter_response', 'collection_agency_letter_response', 'portal_message', 'delivery_confirmation', 'registered_mail_receipt', 'manual_response_note', 'unknown_response')),
          constraint bureau_response_event_status_check
            check (response_status in ('received', 'needs_review', 'linked_to_packet', 'linked_to_outcome', 'archived', 'rejected_as_unrelated')),
          constraint bureau_response_event_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint bureau_response_event_packet_id_fkey
            foreign key (packet_id) references public.packet(id) on delete set null,
          constraint bureau_response_event_dispute_packet_finding_id_fkey
            foreign key (dispute_packet_finding_id) references public.dispute_packet_findings(id) on delete set null,
          constraint bureau_response_event_finding_outcome_id_fkey
            foreign key (finding_outcome_id) references public.finding_outcome(id) on delete set null,
          constraint bureau_response_event_comparison_run_id_fkey
            foreign key (comparison_run_id) references public.outcome_comparison_run(id) on delete set null,
          constraint bureau_response_event_bureau_id_fkey
            foreign key (bureau_id) references public.bureau(id) on delete set null,
          constraint bureau_response_event_agency_id_fkey
            foreign key (agency_id) references public.licensed_collection_agency(id) on delete set null,
          constraint bureau_response_event_attachment_evidence_id_fkey
            foreign key (attachment_evidence_id) references public.evidence_event(id) on delete set null,
          constraint bureau_response_event_evidence_attachment_id_fkey
            foreign key (evidence_attachment_id) references public.evidence_attachment(id) on delete set null,
          constraint bureau_response_event_created_by_fkey
            foreign key (created_by) references public.users(id) on delete set null,
          constraint bureau_response_event_reviewed_by_fkey
            foreign key (reviewed_by) references public.users(id) on delete set null
        )
        `.execute(db);

        await sql`
        create index if not exists idx_bureau_response_event_user_created_at
          on public.bureau_response_event(user_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_packet_id
          on public.bureau_response_event(packet_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_dispute_packet_finding_id
          on public.bureau_response_event(dispute_packet_finding_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_finding_outcome_id
          on public.bureau_response_event(finding_outcome_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_comparison_run_id
          on public.bureau_response_event(comparison_run_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_bureau_id
          on public.bureau_response_event(bureau_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_agency_id
          on public.bureau_response_event(agency_id)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_response_channel
          on public.bureau_response_event(response_channel)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_document_type
          on public.bureau_response_event(response_document_type)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_status
          on public.bureau_response_event(response_status)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_received_at
          on public.bureau_response_event(response_received_at)
        `.execute(db);
        await sql`
        create index if not exists idx_bureau_response_event_normalized_hash
          on public.bureau_response_event(normalized_response_hash)
        `.execute(db);
        await sql`
        alter table public.bureau_response_event
          add column if not exists raw_artifact_metadata jsonb not null default '{}'::jsonb,
          add column if not exists normalized_response_metadata jsonb not null default '{}'::jsonb,
          add column if not exists latest_processing_event_id bigint null,
          add column if not exists latest_processing_status text not null default 'pending',
          add column if not exists latest_classification text not null default 'unknown_manual_review',
          add column if not exists latest_classification_confidence numeric not null default 0,
          add column if not exists latest_extraction_source text not null default 'deterministic',
          add column if not exists latest_requires_manual_review boolean not null default true,
          add column if not exists latest_processing_created_at timestamptz null
        `.execute(db);
        await sql`
        create unique index if not exists idx_bureau_response_event_intake_idempotency_unique
          on public.bureau_response_event ((normalized_response_metadata #>> '{intake,idempotencyKey}'))
          where normalized_response_metadata #>> '{intake,idempotencyKey}' is not null
        `.execute(db);
        await sql`
        create table if not exists public.response_processing_event (
          id bigserial primary key,
          response_event_id bigint not null,
          user_id bigint not null,
          packet_id bigint null,
          dispute_packet_finding_id bigint null,
          finding_outcome_id bigint null,
          comparison_run_id bigint null,
          bureau_id bigint null,
          agency_id bigint null,
          tradeline_id bigint null,
          violation_id bigint null,
          processing_kind text not null default 'deterministic_response_classification',
          processing_status text not null default 'manual_review',
          extraction_source text not null default 'deterministic',
          classifier_rule_id text not null,
          parser_version text not null,
          classification text not null default 'unknown_manual_review',
          classification_confidence numeric not null default 0,
          confidence_threshold numeric not null default 0.8,
          requires_manual_review boolean not null default true,
          uncertainty_codes jsonb not null default '[]'::jsonb,
          raw_artifact_metadata jsonb not null default '{}'::jsonb,
          normalized_response_metadata jsonb not null default '{}'::jsonb,
          deterministic_extraction jsonb not null default '{}'::jsonb,
          field_provenance jsonb not null default '[]'::jsonb,
          rationale jsonb not null default '[]'::jsonb,
          regulation_references jsonb not null default '[]'::jsonb,
          readiness_impact jsonb not null default '{}'::jsonb,
          violation_impact jsonb not null default '{}'::jsonb,
          idempotency_key text not null,
          normalized_response_hash text null,
          original_evidence_hash text null,
          fallback_requested boolean not null default false,
          fallback_allowed boolean not null default false,
          fallback_reason text null,
          dead_letter_reason text null,
          created_at timestamptz not null default now(),
          created_by bigint null,
          constraint response_processing_event_status_check
            check (processing_status in ('completed', 'manual_review', 'dead_letter', 'failed', 'skipped')),
          constraint response_processing_event_source_check
            check (extraction_source in ('deterministic', 'ai_fallback', 'manual_admin_review')),
          constraint response_processing_event_classification_check
            check (classification in ('verified_deleted', 'updated', 'remains', 'frivolous', 'unable_to_verify', 'duplicate', 'suspicious_non_compliant', 'unknown_manual_review')),
          constraint response_processing_event_response_event_id_fkey
            foreign key (response_event_id) references public.bureau_response_event(id) on delete cascade,
          constraint response_processing_event_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint response_processing_event_packet_id_fkey
            foreign key (packet_id) references public.packet(id) on delete set null,
          constraint response_processing_event_dispute_packet_finding_id_fkey
            foreign key (dispute_packet_finding_id) references public.dispute_packet_findings(id) on delete set null,
          constraint response_processing_event_finding_outcome_id_fkey
            foreign key (finding_outcome_id) references public.finding_outcome(id) on delete set null,
          constraint response_processing_event_comparison_run_id_fkey
            foreign key (comparison_run_id) references public.outcome_comparison_run(id) on delete set null,
          constraint response_processing_event_bureau_id_fkey
            foreign key (bureau_id) references public.bureau(id) on delete set null,
          constraint response_processing_event_agency_id_fkey
            foreign key (agency_id) references public.licensed_collection_agency(id) on delete set null,
          constraint response_processing_event_tradeline_id_fkey
            foreign key (tradeline_id) references public.tradeline(id) on delete set null,
          constraint response_processing_event_violation_id_fkey
            foreign key (violation_id) references public.creditor_obligation_test(id) on delete set null,
          constraint response_processing_event_created_by_fkey
            foreign key (created_by) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_response_event_id
          on public.response_processing_event(response_event_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_user_created_at
          on public.response_processing_event(user_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_packet_id
          on public.response_processing_event(packet_id)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_tradeline_id
          on public.response_processing_event(tradeline_id)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_violation_id
          on public.response_processing_event(violation_id)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_classification
          on public.response_processing_event(classification)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_status
          on public.response_processing_event(processing_status)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_manual_review
          on public.response_processing_event(requires_manual_review)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_event_idempotency
          on public.response_processing_event(idempotency_key)
        `.execute(db);
        await sql`
        create table if not exists public.response_admin_review_event (
          id bigserial primary key,
          response_event_id bigint not null,
          user_id bigint not null,
          actor_admin_id bigint not null,
          review_action text not null,
          previous_response_status text not null,
          next_response_status text not null,
          packet_id bigint null,
          dispute_packet_finding_id bigint null,
          finding_outcome_id bigint null,
          comparison_run_id bigint null,
          review_notes_present boolean not null default false,
          review_notes_hash text null,
          confirm_evidence_only boolean not null default false,
          confirm_no_canonical_change boolean not null default false,
          confirm_no_outcome_classification boolean not null default false,
          explicit_confirmation boolean not null default false,
          response_documents_remain_evidence_metadata_only boolean not null default true,
          canonical_facts_mutated boolean not null default false,
          outcome_classification_created boolean not null default false,
          packet_ready_state_changed boolean not null default false,
          packet_text_changed boolean not null default false,
          runtime_activation boolean not null default false,
          override_path_created boolean not null default false,
          furnisher_flow_created boolean not null default false,
          created_at timestamptz not null default now(),
          created_by bigint null,
          constraint response_admin_review_event_action_check
            check (review_action in ('mark_needs_review', 'mark_related', 'mark_unrelated', 'archive_response', 'link_to_packet', 'link_to_outcome', 'add_review_note')),
          constraint response_admin_review_event_previous_status_check
            check (previous_response_status in ('received', 'needs_review', 'linked_to_packet', 'linked_to_outcome', 'archived', 'rejected_as_unrelated')),
          constraint response_admin_review_event_next_status_check
            check (next_response_status in ('received', 'needs_review', 'linked_to_packet', 'linked_to_outcome', 'archived', 'rejected_as_unrelated')),
          constraint response_admin_review_event_response_event_id_fkey
            foreign key (response_event_id) references public.bureau_response_event(id) on delete cascade,
          constraint response_admin_review_event_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint response_admin_review_event_actor_admin_id_fkey
            foreign key (actor_admin_id) references public.users(id) on delete restrict,
          constraint response_admin_review_event_created_by_fkey
            foreign key (created_by) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        create index if not exists idx_response_admin_review_event_response_event_id
          on public.response_admin_review_event(response_event_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_admin_review_event_user_created_at
          on public.response_admin_review_event(user_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_admin_review_event_action
          on public.response_admin_review_event(review_action)
        `.execute(db);
        await sql`
        create table if not exists public.response_processing_job (
          id bigserial primary key,
          job_type text not null,
          status text not null default 'queued',
          payload jsonb not null default '{}'::jsonb,
          idempotency_key text not null,
          actor_user_id bigint null,
          source text not null default 'operator',
          run_after timestamptz not null default now(),
          started_at timestamptz null,
          finished_at timestamptz null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          attempt_count integer not null default 0,
          max_attempts integer not null default 3,
          locked_by text null,
          locked_at timestamptz null,
          locked_until timestamptz null,
          last_error_code text null,
          last_error_reason text null,
          result_summary jsonb not null default '{}'::jsonb,
          constraint response_processing_job_type_check
            check (job_type in (
              'response_intake_process',
              'response_replay_apply',
              'response_replay_dry_run',
              'response_classification_refresh',
              'future_mailbox_intake'
            )),
          constraint response_processing_job_status_check
            check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered')),
          constraint response_processing_job_attempt_check
            check (attempt_count >= 0 and max_attempts > 0 and max_attempts <= 25),
          constraint response_processing_job_actor_user_id_fkey
            foreign key (actor_user_id) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        create table if not exists public.response_processing_job_event (
          id bigserial primary key,
          job_id bigint not null,
          event_type text not null,
          previous_status text null,
          next_status text not null,
          attempt_count integer not null default 0,
          worker_id text null,
          actor_user_id bigint null,
          details jsonb not null default '{}'::jsonb,
          error_code text null,
          error_reason text null,
          created_at timestamptz not null default now(),
          constraint response_processing_job_event_type_check
            check (event_type in (
              'queued',
              'duplicate_enqueue',
              'claimed',
              'succeeded',
              'failed',
              'retry_scheduled',
              'dead_lettered',
              'requeued',
              'operator_retry_requested',
              'dead_letter_acknowledged',
              'stale_running_reviewed',
              'replacement_enqueued',
              'duplicate_remediation_request'
            )),
          constraint response_processing_job_event_next_status_check
            check (next_status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered')),
          constraint response_processing_job_event_previous_status_check
            check (previous_status is null or previous_status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered')),
          constraint response_processing_job_event_job_id_fkey
            foreign key (job_id) references public.response_processing_job(id) on delete cascade,
          constraint response_processing_job_event_actor_user_id_fkey
            foreign key (actor_user_id) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        alter table public.response_processing_job_event
          drop constraint if exists response_processing_job_event_type_check
        `.execute(db);
        await sql`
        alter table public.response_processing_job_event
          add constraint response_processing_job_event_type_check
          check (event_type in (
            'queued',
            'duplicate_enqueue',
            'claimed',
            'succeeded',
            'failed',
            'retry_scheduled',
            'dead_lettered',
            'requeued',
            'operator_retry_requested',
            'dead_letter_acknowledged',
            'stale_running_reviewed',
            'replacement_enqueued',
            'duplicate_remediation_request'
          ))
        `.execute(db);
        await sql`
        create unique index if not exists idx_response_processing_job_active_idempotency_unique
          on public.response_processing_job(idempotency_key)
          where status in ('queued', 'running', 'failed')
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_job_status_run_after
          on public.response_processing_job(status, run_after, created_at, id)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_job_type_status
          on public.response_processing_job(job_type, status)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_job_locked_until
          on public.response_processing_job(status, locked_until)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_job_event_job_created_at
          on public.response_processing_job_event(job_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_processing_job_event_type_created_at
          on public.response_processing_job_event(event_type, created_at desc)
        `.execute(db);

        await sql`
        create table if not exists public.response_worker_orchestration_run (
          id bigserial primary key,
          lock_scope text not null,
          status text not null default 'running',
          mode text not null default 'bounded_once',
          worker_id text not null,
          source text null,
          max_jobs integer not null default 1,
          dry_run boolean not null default false,
          started_at timestamptz not null default now(),
          finished_at timestamptz null,
          locked_until timestamptz not null,
          processed_count integer not null default 0,
          failure_count integer not null default 0,
          skipped_reason text null,
          last_error_code text null,
          last_error_reason text null,
          result_summary jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint response_worker_orchestration_run_status_check
            check (status in ('running', 'succeeded', 'failed', 'skipped')),
          constraint response_worker_orchestration_run_mode_check
            check (mode in ('dry_run', 'bounded_once', 'bounded_batch', 'scheduled_bounded')),
          constraint response_worker_orchestration_run_bounds_check
            check (max_jobs > 0 and max_jobs <= 100 and processed_count >= 0 and failure_count >= 0)
        )
        `.execute(db);
        await sql`
        create table if not exists public.response_worker_orchestration_event (
          id bigserial primary key,
          run_id bigint not null,
          event_type text not null,
          previous_status text null,
          next_status text not null,
          worker_id text null,
          details jsonb not null default '{}'::jsonb,
          error_code text null,
          error_reason text null,
          created_at timestamptz not null default now(),
          constraint response_worker_orchestration_event_type_check
            check (event_type in ('started', 'succeeded', 'failed', 'skipped_overlap', 'skipped_stale_lock')),
          constraint response_worker_orchestration_event_next_status_check
            check (next_status in ('running', 'succeeded', 'failed', 'skipped')),
          constraint response_worker_orchestration_event_previous_status_check
            check (previous_status is null or previous_status in ('running', 'succeeded', 'failed', 'skipped')),
          constraint response_worker_orchestration_event_run_id_fkey
            foreign key (run_id) references public.response_worker_orchestration_run(id) on delete restrict
        )
        `.execute(db);
        await sql`
        do $$
        begin
          if exists (
            select 1
            from pg_constraint
            where conname = 'response_worker_orchestration_event_run_id_fkey'
              and conrelid = 'public.response_worker_orchestration_event'::regclass
              and confdeltype <> 'r'
          ) then
            alter table public.response_worker_orchestration_event
              drop constraint response_worker_orchestration_event_run_id_fkey;
            alter table public.response_worker_orchestration_event
              add constraint response_worker_orchestration_event_run_id_fkey
              foreign key (run_id) references public.response_worker_orchestration_run(id) on delete restrict;
          end if;
        end $$;
        `.execute(db);
        await sql`
        create unique index if not exists idx_response_worker_orchestration_active_lock_unique
          on public.response_worker_orchestration_run(lock_scope)
          where status = 'running'
        `.execute(db);
        await sql`
        create index if not exists idx_response_worker_orchestration_status_created_at
          on public.response_worker_orchestration_run(status, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_worker_orchestration_lock_status
          on public.response_worker_orchestration_run(lock_scope, status, locked_until)
        `.execute(db);
        await sql`
        create index if not exists idx_response_worker_orchestration_source
          on public.response_worker_orchestration_run(source)
        `.execute(db);
        await sql`
        create index if not exists idx_response_worker_orchestration_event_run_created_at
          on public.response_worker_orchestration_event(run_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_response_worker_orchestration_event_type_created_at
          on public.response_worker_orchestration_event(event_type, created_at desc)
        `.execute(db);
      } finally {
        await sql`select pg_advisory_unlock(hashtext('creditregulatorpro.response_document_schema'))`.execute(db);
      }
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
