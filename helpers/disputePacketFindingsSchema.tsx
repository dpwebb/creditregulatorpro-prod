import { sql } from "kysely";
import { db } from "./db";

let ensurePromise: Promise<void> | null = null;

export function ensureDisputePacketFindingsSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.dispute_packet_findings (
          id bigserial primary key,
          dispute_packet_id bigint not null,
          creditor_obligation_test_id bigint not null,
          report_artifact_id bigint null,
          tradeline_id bigint not null,
          user_id bigint not null,
          bureau_id bigint null,
          packet_type text not null,
          evidence_ids jsonb not null default '[]'::jsonb,
          evidence_location_snapshot jsonb not null default '[]'::jsonb,
          readiness_snapshot jsonb not null default '{}'::jsonb,
          packet_item_snapshot jsonb not null default '{}'::jsonb,
          status_at_creation text null,
          selected_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          created_by bigint null,
          source_version text not null default 'simple-dispute-packet-v1',
          backfilled boolean not null default false,
          constraint dispute_packet_findings_packet_type_check
            check (packet_type in ('credit_bureau', 'collection_agency')),
          constraint dispute_packet_findings_packet_finding_unique
            unique (dispute_packet_id, creditor_obligation_test_id),
          constraint dispute_packet_findings_packet_id_fkey
            foreign key (dispute_packet_id) references public.packet(id) on delete cascade,
          constraint dispute_packet_findings_creditor_obligation_test_id_fkey
            foreign key (creditor_obligation_test_id) references public.creditor_obligation_test(id) on delete restrict,
          constraint dispute_packet_findings_report_artifact_id_fkey
            foreign key (report_artifact_id) references public.report_artifact(id) on delete set null,
          constraint dispute_packet_findings_tradeline_id_fkey
            foreign key (tradeline_id) references public.tradeline(id) on delete restrict,
          constraint dispute_packet_findings_user_id_fkey
            foreign key (user_id) references public.users(id) on delete restrict,
          constraint dispute_packet_findings_bureau_id_fkey
            foreign key (bureau_id) references public.bureau(id) on delete set null,
          constraint dispute_packet_findings_created_by_fkey
            foreign key (created_by) references public.users(id) on delete set null
        )
      `.execute(db);

      await sql`
        create index if not exists idx_dispute_packet_findings_creditor_obligation_test_id
          on public.dispute_packet_findings(creditor_obligation_test_id)
      `.execute(db);
      await sql`
        create index if not exists idx_dispute_packet_findings_dispute_packet_id
          on public.dispute_packet_findings(dispute_packet_id)
      `.execute(db);
      await sql`
        create index if not exists idx_dispute_packet_findings_user_created_at
          on public.dispute_packet_findings(user_id, created_at desc)
      `.execute(db);
      await sql`
        create index if not exists idx_dispute_packet_findings_tradeline_created_at
          on public.dispute_packet_findings(tradeline_id, created_at desc)
      `.execute(db);
      await sql`
        create index if not exists idx_dispute_packet_findings_report_artifact_id
          on public.dispute_packet_findings(report_artifact_id)
      `.execute(db);
      await sql`
        create index if not exists idx_dispute_packet_findings_bureau_id
          on public.dispute_packet_findings(bureau_id)
      `.execute(db);
    })();
  }

  return ensurePromise;
}
