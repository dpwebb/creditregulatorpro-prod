import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

async function createRegulationRegistrySchema(): Promise<void> {
  await sql`
    create table if not exists public.regulation_registry (
      id bigserial primary key,
      regulation_id text not null,
      jurisdiction text not null,
      authority_source text not null,
      regulation_title text not null,
      section_number text not null,
      subsection text null,
      short_title text not null,
      full_text text not null,
      plain_language_summary text not null,
      official_source_url text not null,
      publication_date timestamptz null,
      effective_date timestamptz null,
      repeal_superseded_status text not null default 'current',
      regulation_category text not null,
      tags text[] not null default '{}'::text[],
      parser_safe_normalized_text text not null,
      citation_format text not null,
      update_version integer not null,
      active_status text not null default 'inactive',
      review_status text not null default 'pending_review',
      confidence_score numeric not null default 0,
      source_content_hash text not null,
      source_document_url text null,
      supersedes_record_id bigint null references public.regulation_registry(id) on delete set null,
      superseded_by_record_id bigint null references public.regulation_registry(id) on delete set null,
      approval_notes text null,
      approved_by bigint null references public.users(id) on delete set null,
      approved_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(regulation_id, update_version)
    )
  `.execute(db);

  await sql`
    create table if not exists public.regulation_update_source (
      id bigserial primary key,
      name text not null,
      jurisdiction text not null,
      authority_source text not null,
      source_url text not null,
      regulation_category text not null,
      enabled boolean not null default true,
      update_mode text not null default 'manual_only',
      last_checked_at timestamptz null,
      last_content_hash text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(source_url)
    )
  `.execute(db);

  await sql`
    create table if not exists public.regulation_source_scan (
      id bigserial primary key,
      source_id bigint null references public.regulation_update_source(id) on delete set null,
      triggered_by bigint null references public.users(id) on delete set null,
      mode text not null,
      status text not null default 'started',
      started_at timestamptz not null default now(),
      completed_at timestamptz null,
      fetched_url text null,
      content_hash text null,
      detected_change_count integer not null default 0,
      error_message text null
    )
  `.execute(db);

  await sql`
    create table if not exists public.regulation_update_candidate (
      id bigserial primary key,
      candidate_regulation_id text not null,
      existing_regulation_record_id bigint null references public.regulation_registry(id) on delete set null,
      source_scan_id bigint null references public.regulation_source_scan(id) on delete set null,
      change_classification text not null,
      status text not null default 'pending_review',
      jurisdiction text not null,
      authority_source text not null,
      regulation_title text not null,
      section_number text not null,
      subsection text null,
      short_title text not null,
      full_text text not null,
      plain_language_summary text not null,
      official_source_url text not null,
      publication_date timestamptz null,
      effective_date timestamptz null,
      repeal_superseded_status text not null default 'current',
      regulation_category text not null,
      tags text[] not null default '{}'::text[],
      parser_safe_normalized_text text not null,
      citation_format text not null,
      proposed_version integer not null default 1,
      normalized_text_hash text not null,
      confidence_score numeric not null default 0,
      diff_report jsonb not null default '{}'::jsonb,
      confidence_reasons text[] not null default '{}'::text[],
      ambiguity_reasons text[] not null default '{}'::text[],
      duplicate_candidate_ids bigint[] not null default '{}'::bigint[],
      source_document_url text null,
      detected_at timestamptz not null default now(),
      reviewed_at timestamptz null,
      reviewed_by bigint null references public.users(id) on delete set null,
      review_notes text null,
      created_regulation_record_id bigint null references public.regulation_registry(id) on delete set null
    )
  `.execute(db);

  await sql`
    create table if not exists public.regulation_violation_mapping (
      id bigserial primary key,
      violation_category text not null,
      regulation_id text not null,
      regulation_record_id bigint null references public.regulation_registry(id) on delete set null,
      section_number text not null,
      subsection text null,
      jurisdiction text not null,
      explanation_template text not null,
      active boolean not null default true,
      review_status text not null default 'approved',
      approved_by bigint null references public.users(id) on delete set null,
      approved_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create unique index if not exists idx_regulation_registry_active_truth
    on public.regulation_registry(regulation_id)
    where active_status = 'active' and review_status = 'approved'
  `.execute(db);

  await sql`create index if not exists idx_regulation_registry_filters on public.regulation_registry(jurisdiction, regulation_category, active_status, review_status)`.execute(db);
  await sql`create index if not exists idx_regulation_candidate_status on public.regulation_update_candidate(status, change_classification, detected_at desc)`.execute(db);
  await sql`create index if not exists idx_regulation_candidate_regulation_id on public.regulation_update_candidate(candidate_regulation_id)`.execute(db);
  await sql`create index if not exists idx_regulation_mapping_violation on public.regulation_violation_mapping(violation_category, active)`.execute(db);
  await sql`create index if not exists idx_regulation_mapping_regulation on public.regulation_violation_mapping(regulation_id, active)`.execute(db);
}

export function ensureRegulationRegistrySchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = createRegulationRegistrySchema().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}
