import { sql } from "kysely";

import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureIngestProcessingQueueSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`select pg_advisory_lock(hashtext('creditregulatorpro.ingest_processing_queue_schema'))`.execute(db);
      try {
        await sql`
        create table if not exists public.ingest_processing_job (
          id bigserial primary key,
          job_type text not null,
          status text not null default 'queued',
          report_artifact_id bigint not null,
          user_id bigint not null,
          organization_id bigint null,
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
          constraint ingest_processing_job_type_check
            check (job_type in ('report_ingest_process')),
          constraint ingest_processing_job_status_check
            check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered', 'canceled')),
          constraint ingest_processing_job_attempt_check
            check (attempt_count >= 0 and max_attempts > 0 and max_attempts <= 25),
          constraint ingest_processing_job_report_artifact_id_fkey
            foreign key (report_artifact_id) references public.report_artifact(id) on delete restrict,
          constraint ingest_processing_job_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint ingest_processing_job_actor_user_id_fkey
            foreign key (actor_user_id) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        create table if not exists public.ingest_processing_job_event (
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
          constraint ingest_processing_job_event_type_check
            check (event_type in (
              'queued',
              'duplicate_enqueue',
              'claimed',
              'ocr_parsing_started',
              'compliance_scan_started',
              'succeeded',
              'retry_scheduled',
              'dead_lettered',
              'operator_retry_requested',
              'dead_letter_acknowledged',
              'stale_running_reviewed',
              'cleanup_attempted',
              'cleanup_failed',
              'operator_remediation_action',
              'canceled'
            )),
          constraint ingest_processing_job_event_next_status_check
            check (next_status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered', 'canceled')),
          constraint ingest_processing_job_event_previous_status_check
            check (previous_status is null or previous_status in ('queued', 'running', 'succeeded', 'failed', 'dead_lettered', 'canceled')),
          constraint ingest_processing_job_event_job_id_fkey
            foreign key (job_id) references public.ingest_processing_job(id) on delete restrict,
          constraint ingest_processing_job_event_actor_user_id_fkey
            foreign key (actor_user_id) references public.users(id) on delete set null
        )
        `.execute(db);
        await sql`
        alter table public.ingest_processing_job_event
          drop constraint if exists ingest_processing_job_event_type_check
        `.execute(db);
        await sql`
        alter table public.ingest_processing_job_event
          add constraint ingest_processing_job_event_type_check
          check (event_type in (
            'queued',
            'duplicate_enqueue',
            'claimed',
            'ocr_parsing_started',
            'compliance_scan_started',
            'succeeded',
            'retry_scheduled',
            'dead_lettered',
            'operator_retry_requested',
            'dead_letter_acknowledged',
            'stale_running_reviewed',
            'cleanup_attempted',
            'cleanup_failed',
            'operator_remediation_action',
            'canceled'
          ))
        `.execute(db);
        await sql`
        create unique index if not exists idx_ingest_processing_job_active_idempotency_unique
          on public.ingest_processing_job(idempotency_key)
          where status in ('queued', 'running', 'failed')
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_status_run_after
          on public.ingest_processing_job(status, run_after, created_at, id)
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_artifact_status
          on public.ingest_processing_job(report_artifact_id, status)
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_user_created_at
          on public.ingest_processing_job(user_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_locked_until
          on public.ingest_processing_job(status, locked_until)
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_event_job_created_at
          on public.ingest_processing_job_event(job_id, created_at desc)
        `.execute(db);
        await sql`
        create index if not exists idx_ingest_processing_job_event_type_created_at
          on public.ingest_processing_job_event(event_type, created_at desc)
        `.execute(db);
      } finally {
        await sql`select pg_advisory_unlock(hashtext('creditregulatorpro.ingest_processing_queue_schema'))`.execute(db);
      }
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}
