import { sql } from "kysely";
import { db } from "./db";
import { ensureDisputePacketFindingsSchema } from "./disputePacketFindingsSchema";
import { ensureOutcomeTrackingSchema } from "./outcomeTrackingSchema";

let ensurePromise: Promise<void> | null = null;

export function ensureResponseDocumentSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
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
    })();
  }

  return ensurePromise;
}
