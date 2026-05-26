import "../loadEnv.js";

import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const FIXTURE_SOURCE = "local_app_fixture_v1";

function requireLocalDatabaseUrl(): string {
  const url = process.env.FLOOT_DATABASE_URL;
  if (!url) {
    throw new Error("FLOOT_DATABASE_URL is not set after loading local env.");
  }

  if (process.env.CRP_LOCAL_DEV !== "true") {
    throw new Error("Refusing to bootstrap app fixtures unless CRP_LOCAL_DEV=true.");
  }

  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to bootstrap a non-local database host: ${parsed.hostname}`);
  }

  const expectedDatabase = process.env.LOCAL_DATABASE_NAME?.trim();
  const actualDatabase = parsed.pathname.replace(/^\//, "");
  if (expectedDatabase && actualDatabase !== expectedDatabase) {
    throw new Error(
      `Refusing to bootstrap ${actualDatabase}; expected LOCAL_DATABASE_NAME=${expectedDatabase}.`,
    );
  }

  return url;
}

async function requireAuthBootstrap(sql: Sql) {
  const rows = await sql`
    select to_regclass('public.users') as users_table,
           to_regclass('public.user_account') as user_account_table,
           to_regclass('public.subscriptions') as subscriptions_table
  `;

  const row = rows[0];
  if (!row?.users_table || !row?.user_account_table || !row?.subscriptions_table) {
    throw new Error("Run pnpm run bootstrap:local-auth-schema before bootstrapping app fixtures.");
  }
}

async function createCoreAppTables(sql: Sql) {
  await sql`create table if not exists public.bureau (
    id bigserial primary key,
    name text not null,
    address text null,
    address_line1 text null,
    address_line2 text null,
    city text null,
    province text null,
    postal_code text null,
    contact_phone text null,
    contact_email text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.creditor (
    id bigserial primary key,
    name text not null,
    address text null,
    contact_phone text null,
    contact_email text null,
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.licensed_collection_agency (
    id bigserial primary key,
    agency_name text not null,
    agency_name_normalized text not null,
    province text not null,
    license_number text null,
    license_status text not null default 'active',
    license_expiry_date timestamptz null,
    data_source text not null default 'admin_manual',
    verified_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`
    create unique index if not exists idx_licensed_collection_agency_normalized_province
      on public.licensed_collection_agency(agency_name_normalized, province)
  `;

  await sql`create table if not exists public.report_artifact (
    id bigserial primary key,
    user_id bigint null references public.users(id) on delete set null,
    organization_id bigint null,
    tradeline_id bigint null,
    artifact_type text null,
    report_date timestamptz null,
    metro2_version text null,
    sha256 text null,
    storage_url text null,
    data jsonb null,
    validation_rules_applied jsonb null default '[]'::jsonb,
    crrg_year integer null,
    expires_at timestamptz null,
    processing_status text not null default 'completed',
    region text null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.tradeline (
    id bigserial primary key,
    user_id bigint null references public.users(id) on delete set null,
    organization_id bigint null,
    bureau_id bigint null references public.bureau(id) on delete set null,
    creditor_id bigint null references public.creditor(id) on delete set null,
    report_artifact_id bigint null references public.report_artifact(id) on delete set null,
    account_number text not null,
    account_type text null,
    account_designation text null,
    status text null,
    balance numeric null,
    current_balance numeric null,
    amount_past_due numeric null,
    high_credit numeric null,
    credit_limit numeric null,
    monthly_payment numeric null,
    scheduled_monthly_payment numeric null,
    actual_payment_amount numeric null,
    last_payment_amount numeric null,
    original_balance numeric null,
    amount_written_off numeric null,
    interest_rate numeric null,
    opened_date timestamptz null,
    date_closed timestamptz null,
    date_of_first_delinquency timestamptz null,
    date_of_last_payment timestamptz null,
    last_activity_date timestamptz null,
    last_reported_date timestamptz null,
    posted_date timestamptz null,
    charge_off_date timestamptz null,
    balloon_payment_date timestamptz null,
    maturity_date timestamptz null,
    date_assigned_to_collection timestamptz null,
    date_paid_settled timestamptz null,
    date_verified timestamptz null,
    mop text null default null,
    terms text null,
    payment_pattern text null,
    payment_history_profile text null,
    months_reviewed text null,
    responsibility_code text null,
    ecoa_code text null,
    rating_code text null,
    rating_code_description text null,
    member_number text null,
    purchased_sold_indicator text null,
    original_creditor_name text null,
    collection_agency_name text null,
    creditor_phone text null,
    source_text text null,
    notes text null,
    is_collection_account boolean null default false,
    has_j1_segment boolean null default false,
    has_j2_segment boolean null default false,
    j1_consumer_name text null,
    j2_consumer_name text null,
    last_dispute_vectors jsonb null default '[]'::jsonb,
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.tradeline_artifact_presence (
    id bigserial primary key,
    tradeline_id bigint not null references public.tradeline(id) on delete cascade,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique(report_artifact_id, tradeline_id)
  )`;

  await sql`create table if not exists public.tradeline_snapshot (
    id bigserial primary key,
    tradeline_id bigint not null references public.tradeline(id) on delete cascade,
    report_artifact_id bigint null references public.report_artifact(id) on delete set null,
    creditor_name text null,
    account_number text null,
    account_type text null,
    status text null,
    balance numeric null,
    current_balance numeric null,
    amount_past_due numeric null,
    high_credit numeric null,
    credit_limit numeric null,
    opened_date timestamptz null,
    date_closed timestamptz null,
    date_of_first_delinquency timestamptz null,
    date_of_last_payment timestamptz null,
    last_activity_date timestamptz null,
    last_reported_date timestamptz null,
    payment_pattern text null,
    mop text null,
    responsibility_code text null,
    ecoa_code text null,
    terms text null,
    is_collection_account boolean null default false,
    original_creditor_name text null,
    collection_agency_name text null,
    snapshot_at timestamptz not null default now()
  )`;

  await sql`create table if not exists public.obligation_instance (
    id bigserial primary key,
    user_id bigint null references public.users(id) on delete set null,
    organization_id bigint null,
    tradeline_id bigint null references public.tradeline(id) on delete cascade,
    obligation_id bigint null,
    state text null,
    dispute_vector text null,
    notes text null,
    pressure_score numeric null,
    challenge_sent_date timestamptz null,
    response_deadline timestamptz null,
    response_received_date timestamptz null,
    response_status text null,
    response_letter_content text null,
    response_sender_address text null,
    response_expected_address text null,
    response_authorized_signature boolean null,
    response_signatory_name text null,
    response_signatory_title text null,
    response_documentation_provided boolean null,
    response_documentation_types jsonb null default '[]'::jsonb,
    response_mov_disclosed boolean null,
    response_mov_description text null,
    response_items_disputed jsonb null default '[]'::jsonb,
    response_items_addressed jsonb null default '[]'::jsonb,
    response_audit_completed_at timestamptz null,
    response_audit_findings jsonb null default '[]'::jsonb,
    escalation_triggered boolean null default false,
    escalation_date timestamptz null,
    success_outcome text null,
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.creditor_obligation_test (
    id bigserial primary key,
    tradeline_id bigint null references public.tradeline(id) on delete cascade,
    creditor_id bigint null references public.creditor(id) on delete set null,
    obligation_type text not null,
    obligation_state text null default 'OBLIGATION_PENDING',
    violation_category text null,
    user_status text not null default 'active',
    severity text null default 'MEDIUM',
    user_explanation text null,
    user_status_reason text null,
    user_status_updated_at timestamptz null,
    technical_details jsonb null,
    statutory_basis text null,
    recommended_action text null,
    validation_status text null,
    dispute_vector text null,
    escalation_path text null,
    omissions text null,
    metro2_version text null,
    notes text null,
    confidence_score integer null default 90,
    obligation_sequence integer null default 1,
    auto_generated boolean null default true,
    responses_received integer null default 0,
    response_deadline timestamptz null,
    last_test_date timestamptz null,
    last_challenge_date timestamptz null,
    detected_at timestamptz null default now(),
    created_at timestamptz null default now(),
    updated_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.packet (
    id bigserial primary key,
    user_id bigint null references public.users(id) on delete set null,
    organization_id bigint null,
    tradeline_id bigint null references public.tradeline(id) on delete set null,
    bureau_id bigint null references public.bureau(id) on delete set null,
    creditor_obligation_test_id bigint null references public.creditor_obligation_test(id) on delete set null,
    statute_version_id bigint null,
    baseline_snapshot_id bigint null,
    content text null,
    status text null,
    terminal_label text null,
    type text null,
    letter_date timestamptz null,
    sent_date timestamptz null,
    delivery_method text null,
    tracking_number text null,
    response_type text null,
    bureau_response_date timestamptz null,
    consumer_certification boolean null default false,
    success_outcome text null,
    signature_mode text null,
    processing_status text not null default 'completed',
    pdf_storage_url text null,
    postgrid_letter_id text null,
    recipient_name text null,
    recipient_address_line1 text null,
    recipient_address_line2 text null,
    recipient_city text null,
    recipient_province text null,
    recipient_postal_code text null,
    region text null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.evidence_event (
    id bigserial primary key,
    event_type text not null,
    packet_id bigint null references public.packet(id) on delete cascade,
    statute_version_id bigint null,
    organization_id bigint null,
    description text null,
    previous_hash text null,
    current_hash text null,
    region text not null default 'CA',
    at timestamptz null default now()
  )`;
  await sql`create index if not exists idx_evidence_event_packet_id on public.evidence_event(packet_id)`;

  await sql`create table if not exists public.evidence_attachment (
    id bigserial primary key,
    packet_id bigint null references public.packet(id) on delete cascade,
    obligation_instance_id bigint null references public.obligation_instance(id) on delete set null,
    uploaded_by bigint null references public.users(id) on delete set null,
    file_name text not null,
    file_type text not null,
    file_size_bytes integer not null,
    storage_url text not null,
    description text null,
    region text not null default 'CA',
    uploaded_at timestamptz not null default now()
  )`;
  await sql`create index if not exists idx_evidence_attachment_packet_id on public.evidence_attachment(packet_id)`;

  await sql`create table if not exists public.dispute_packet_findings (
    id bigserial primary key,
    dispute_packet_id bigint not null,
    creditor_obligation_test_id bigint not null,
    report_artifact_id bigint null,
    tradeline_id bigint not null,
    user_id bigint not null,
    bureau_id bigint null,
    packet_type text not null check (packet_type in ('credit_bureau', 'collection_agency')),
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
    constraint dispute_packet_findings_packet_finding_unique
      unique(dispute_packet_id, creditor_obligation_test_id),
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
  )`;

  await sql`create table if not exists public.success_metric (
    id bigserial primary key,
    obligation_instance_id bigint null references public.obligation_instance(id) on delete cascade,
    creditor_id bigint null references public.creditor(id) on delete set null,
    bureau_id bigint null references public.bureau(id) on delete set null,
    dispute_vector text null,
    violation_category text null,
    outcome text not null,
    final_state text null,
    response_time_days integer null,
    escalation_count integer null default 0,
    region text not null default 'CA',
    recorded_at timestamptz not null default now()
  )`;

  await sql`create table if not exists public.parser_test_case (
    id bigserial primary key,
    name text not null,
    description text null,
    pdf_base64 text not null,
    raw_extracted_text text null,
    expected_consumer_info jsonb null,
    expected_tradelines jsonb null default '[]'::jsonb,
    bureau text null,
    parser_mode text null,
    allow_ai_fallback boolean null,
    stage_version text null,
    extraction_source text null,
    parser_context jsonb not null default '{}'::jsonb,
    admin_review_status text not null default 'needs_review',
    approved_consumer_info jsonb null,
    approved_tradelines jsonb null default '[]'::jsonb,
    adjudication_decisions jsonb not null default '[]'::jsonb,
    created_by bigint not null references public.users(id) on delete cascade,
    last_run_at timestamptz null,
    last_run_passed boolean null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;

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
  `;

  await sql`create table if not exists public.parser_test_run (
    id bigserial primary key,
    test_case_id bigint not null references public.parser_test_case(id) on delete cascade,
    passed boolean not null default false,
    actual_consumer_info jsonb null,
    actual_tradelines jsonb null default '[]'::jsonb,
    field_results jsonb null default '[]'::jsonb,
    pattern_suggestions jsonb null default '[]'::jsonb,
    run_at timestamptz not null default now()
  )`;

  await sql`create table if not exists public.pass_extraction (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    pass text not null default 'A',
    status text not null default 'completed',
    channel_guess text null,
    channel_confidence integer null,
    consumer_profile jsonb null,
    accounts jsonb null,
    bureau_context jsonb null,
    portal_summary jsonb null,
    inquiries_credit_related jsonb null,
    inquiries_other jsonb null,
    insolvency_public_records jsonb null,
    conflicts jsonb null default '[]'::jsonb,
    missing_required_fields jsonb null default '[]'::jsonb,
    quality_notes jsonb null default '[]'::jsonb,
    raw_evidence jsonb null default '{}'::jsonb,
    error_message text null,
    error_details jsonb null,
    started_at timestamptz null,
    completed_at timestamptz null,
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.violation_correction (
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
  )`;

  await sql`create table if not exists public.violation_correction_evidence (
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
  )`;

  await sql`create table if not exists public.violation_regulation_reference (
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
  )`;

  await sql`create table if not exists public.violation_training_example (
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
  )`;

  await sql`create table if not exists public.pass_a_edit_log (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    path text not null,
    op text not null,
    value jsonb null,
    reason text null,
    source_type text not null default 'manual',
    source_timestamp timestamptz not null default now(),
    created_at timestamptz not null default now()
  )`;

  await sql`create table if not exists public.report_consumer_info (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    full_name text null,
    first_name text null,
    middle_name text null,
    last_name text null,
    suffix text null,
    address_line1 text null,
    address_line2 text null,
    city text null,
    province text null,
    postal_code text null,
    date_of_birth timestamptz null,
    date_of_birth_raw text null,
    phone text null,
    phone_secondary text null,
    sin_last_digits text null,
    dependents_count integer null,
    spouse_name text null,
    file_number text null,
    report_date timestamptz null,
    previous_addresses jsonb null default '[]'::jsonb,
    previous_names jsonb null default '[]'::jsonb,
    raw_section_text text null,
    confidence_score integer null default 100,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.report_credit_score (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    score_type text not null,
    score_value integer null,
    score_date timestamptz null,
    score_range_min integer null,
    score_range_max integer null,
    score_factors jsonb null default '[]'::jsonb,
    bureau_name text null,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.report_inquiry (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    inquiry_type text not null default 'unknown',
    creditor_name text null,
    inquiry_date timestamptz null,
    inquiry_purpose text null,
    subscriber_code text null,
    industry_code text null,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.report_public_record (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    record_type text not null,
    filing_date timestamptz null,
    discharge_date timestamptz null,
    release_date timestamptz null,
    satisfied_date timestamptz null,
    verified_date timestamptz null,
    amount numeric null,
    liability_amount numeric null,
    asset_amount numeric null,
    exempt_amount numeric null,
    case_number text null,
    court_name text null,
    court_location text null,
    attorney text null,
    trustee text null,
    plaintiff text null,
    bankruptcy_type text null,
    status text null,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.report_consumer_statement (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    statement_type text not null,
    statement_text text null,
    effective_date timestamptz null,
    expiration_date timestamptz null,
    added_date timestamptz null,
    associated_tradeline_id bigint null,
    associated_inquiry_id bigint null,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.report_employment_info (
    id bigserial primary key,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    employer_name text null,
    employer_address text null,
    employer_city text null,
    employer_province text null,
    employer_postal_code text null,
    employer_phone text null,
    occupation text null,
    employment_status text null,
    salary numeric null,
    salary_frequency text null,
    hire_date timestamptz null,
    termination_date timestamptz null,
    verified_date timestamptz null,
    is_current boolean null default false,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create table if not exists public.tradeline_payment_history (
    id bigserial primary key,
    tradeline_id bigint not null references public.tradeline(id) on delete cascade,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    payment_pattern text null,
    payment_pattern_start_date timestamptz null,
    portfolio_type text null,
    account_condition text null,
    compliance_condition_code text null,
    consumer_information_indicator text null,
    responsibility_code text null default null,
    ecoa_code text null,
    special_comment_codes jsonb null default '[]'::jsonb,
    worst_delinquency_code text null,
    worst_delinquency_date timestamptz null,
    monthly_payment numeric null,
    minimum_payment numeric null,
    last_payment_amount numeric null,
    date_of_last_payment timestamptz null,
    last_activity_date timestamptz null,
    last_reported_date timestamptz null,
    terms_months integer null,
    terms_frequency text null,
    times_30_days_late integer null default 0,
    times_60_days_late integer null default 0,
    times_90_days_late integer null default 0,
    times_120_days_late integer null default 0,
    raw_section_text text null,
    region text not null default 'CA',
    created_at timestamptz null default now(),
    unique(tradeline_id, report_artifact_id)
  )`;

  await sql`create table if not exists public.tradeline_payment_history_detail (
    id bigserial primary key,
    tradeline_id bigint not null references public.tradeline(id) on delete cascade,
    report_artifact_id bigint not null references public.report_artifact(id) on delete cascade,
    period_date timestamptz null,
    balance numeric null,
    payment numeric null,
    past_due numeric null,
    mop text null,
    terms text null,
    high_credit numeric null,
    credit_limit numeric null,
    balloon_payment numeric null,
    charge_off numeric null,
    narrative text null,
    region text not null default 'CA',
    created_at timestamptz null default now()
  )`;

  await sql`create index if not exists idx_report_artifact_user_id on public.report_artifact(user_id)`;
  await sql`create index if not exists idx_report_artifact_fixture_sha on public.report_artifact(sha256)`;
  await sql`create index if not exists idx_tradeline_user_id on public.tradeline(user_id)`;
  await sql`create index if not exists idx_tradeline_report_artifact_id on public.tradeline(report_artifact_id)`;
  await sql`create index if not exists idx_creditor_obligation_test_tradeline_id on public.creditor_obligation_test(tradeline_id)`;
  await sql`create index if not exists idx_violation_correction_run on public.violation_correction(extraction_run_id)`;
  await sql`create index if not exists idx_violation_correction_tradeline on public.violation_correction(tradeline_id)`;
  await sql`create index if not exists idx_violation_correction_original on public.violation_correction(original_violation_id)`;
  await sql`create index if not exists idx_violation_correction_status on public.violation_correction(status)`;
  await sql`create index if not exists idx_violation_correction_evidence_correction on public.violation_correction_evidence(correction_id)`;
  await sql`create index if not exists idx_violation_regulation_reference_correction on public.violation_regulation_reference(correction_id)`;
  await sql`create index if not exists idx_violation_training_example_correction on public.violation_training_example(correction_id)`;
  await sql`create index if not exists idx_packet_tradeline_id on public.packet(tradeline_id)`;
  await sql`create index if not exists idx_dispute_packet_findings_creditor_obligation_test_id on public.dispute_packet_findings(creditor_obligation_test_id)`;
  await sql`create index if not exists idx_dispute_packet_findings_dispute_packet_id on public.dispute_packet_findings(dispute_packet_id)`;
  await sql`create index if not exists idx_dispute_packet_findings_user_created_at on public.dispute_packet_findings(user_id, created_at desc)`;
  await sql`create index if not exists idx_dispute_packet_findings_tradeline_created_at on public.dispute_packet_findings(tradeline_id, created_at desc)`;
  await sql`create index if not exists idx_dispute_packet_findings_report_artifact_id on public.dispute_packet_findings(report_artifact_id)`;
  await sql`create index if not exists idx_dispute_packet_findings_bureau_id on public.dispute_packet_findings(bureau_id)`;
}

async function ensureUser(sql: Sql, email: string, displayName: string, role: string) {
  const rows = await sql`
    insert into public.users (email, display_name, role, email_verified)
    values (${email}, ${displayName}, ${role}, true)
    on conflict (email)
    do update set display_name = excluded.display_name, role = excluded.role, email_verified = true
    returning id
  `;

  const id = Number(rows[0]?.id);
  await sql`
    insert into public.user_account (
      user_id, email, full_name, legal_name_signature, role, region, terms_accepted_at, terms_accepted_version
    )
    values (${id}, ${email}, ${displayName}, ${displayName}, ${role}, 'CA', now(), 'v1')
    on conflict (user_id)
    do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role
  `;

  const subscription = await sql`
    select id
    from public.subscriptions
    where user_id = ${id}
    order by updated_at desc nulls last, id desc
    limit 1
  `;

  if (subscription[0]?.id) {
    const subscriptionId = Number(subscription[0].id);
    await sql`
      update public.subscriptions
      set plan = 'beta',
          status = 'active',
          trial_end = now() + interval '100 years',
          updated_at = now()
      where id = ${subscriptionId}
    `;
    await sql`
      delete from public.subscriptions
      where user_id = ${id}
        and id <> ${subscriptionId}
    `;
  } else {
    await sql`
      insert into public.subscriptions (user_id, plan, status, trial_start, trial_end, created_at, updated_at)
      values (${id}, 'beta', 'active', now(), now() + interval '100 years', now(), now())
    `;
  }

  return id;
}

async function ensureBureau(sql: Sql, name: string, province: string, city: string) {
  const existing = await sql`select id from public.bureau where lower(name) = lower(${name}) limit 1`;
  if (existing[0]?.id) return Number(existing[0].id);

  const rows = await sql`
    insert into public.bureau (name, province, city, region)
    values (${name}, ${province}, ${city}, 'CA')
    returning id
  `;
  return Number(rows[0].id);
}

async function ensureCreditor(sql: Sql, name: string) {
  const existing = await sql`select id from public.creditor where lower(name) = lower(${name}) limit 1`;
  if (existing[0]?.id) return Number(existing[0].id);

  const rows = await sql`
    insert into public.creditor (name)
    values (${name})
    returning id
  `;
  return Number(rows[0].id);
}

async function ensureArtifact(sql: Sql, input: {
  key: string;
  userId: number;
  fileName: string;
  bureauName: string;
  reportDate: string;
}) {
  const existing = await sql`select id from public.report_artifact where sha256 = ${input.key} limit 1`;
  if (existing[0]?.id) {
    const id = Number(existing[0].id);
    await sql`
      update public.report_artifact
      set user_id = ${input.userId},
          artifact_type = 'consumer_disclosure',
          report_date = ${input.reportDate},
          data = jsonb_build_object(
            'localFixtureSource', ${FIXTURE_SOURCE}::text,
            'localFixtureKey', ${input.key}::text,
            'fileName', ${input.fileName}::text,
            'mimeType', 'application/pdf',
            'bureauName', ${input.bureauName}::text,
            'parserQuality', jsonb_build_object(
              'sourceBureauName', ${input.bureauName}::text,
              'confidenceScore', 96,
              'requiresManualReview', false,
              'qualityGates', jsonb_build_array()
            )
          ),
          processing_status = 'completed',
          region = 'CA'
      where id = ${id}
    `;
    return id;
  }

  const rows = await sql`
    insert into public.report_artifact (
      user_id, artifact_type, report_date, sha256, storage_url, data, processing_status, region, created_at, expires_at
    )
    values (
      ${input.userId},
      'consumer_disclosure',
      ${input.reportDate},
      ${input.key},
      ${`local-fixture://${input.key}`},
      jsonb_build_object(
        'localFixtureSource', ${FIXTURE_SOURCE}::text,
        'localFixtureKey', ${input.key}::text,
        'fileName', ${input.fileName}::text,
        'mimeType', 'application/pdf',
        'bureauName', ${input.bureauName}::text,
        'parserQuality', jsonb_build_object(
          'sourceBureauName', ${input.bureauName}::text,
          'confidenceScore', 96,
          'requiresManualReview', false,
          'qualityGates', jsonb_build_array()
        )
      ),
      'completed',
      'CA',
      now(),
      now() + interval '1 year'
    )
    returning id
  `;
  return Number(rows[0].id);
}

async function ensureTradeline(sql: Sql, input: {
  userId: number;
  artifactId: number;
  bureauId: number;
  creditorId: number;
  accountNumber: string;
  accountType: string;
  status: string;
  balance: number;
  currentBalance: number;
  pastDue: number;
  highCredit: number | null;
  creditLimit: number | null;
  openedDate: string | null;
  reportedDate: string | null;
  closedDate: string | null;
  dofd: string | null;
  lastPaymentDate: string | null;
  postedDate: string | null;
  terms: string | null;
  mop: string | null;
  paymentPattern: string | null;
  monthsReviewed: string | null;
  sourceText: string;
  isCollectionAccount?: boolean;
  originalCreditorName?: string | null;
  collectionAgencyName?: string | null;
}) {
  const existing = await sql`
    select id from public.tradeline
    where report_artifact_id = ${input.artifactId}
      and account_number = ${input.accountNumber}
    limit 1
  `;

  if (existing[0]?.id) {
    const id = Number(existing[0].id);
    await sql`
      update public.tradeline
      set user_id = ${input.userId},
          bureau_id = ${input.bureauId},
          creditor_id = ${input.creditorId},
          account_type = ${input.accountType},
          status = ${input.status},
          balance = ${input.balance},
          current_balance = ${input.currentBalance},
          amount_past_due = ${input.pastDue},
          high_credit = ${input.highCredit},
          credit_limit = ${input.creditLimit},
          opened_date = ${input.openedDate},
          last_reported_date = ${input.reportedDate},
          date_closed = ${input.closedDate},
          date_of_first_delinquency = ${input.dofd},
          date_of_last_payment = ${input.lastPaymentDate},
          posted_date = ${input.postedDate},
          terms = ${input.terms},
          mop = ${input.mop},
          payment_pattern = ${input.paymentPattern},
          payment_history_profile = ${input.paymentPattern},
          months_reviewed = ${input.monthsReviewed},
          source_text = ${input.sourceText},
          is_collection_account = ${input.isCollectionAccount === true},
          original_creditor_name = ${input.originalCreditorName ?? null},
          collection_agency_name = ${input.collectionAgencyName ?? null}
      where id = ${id}
    `;
    return id;
  }

  const rows = await sql`
    insert into public.tradeline (
      user_id, report_artifact_id, bureau_id, creditor_id, account_number, account_type, status,
      balance, current_balance, amount_past_due, high_credit, credit_limit, opened_date,
      last_reported_date, date_closed, date_of_first_delinquency, date_of_last_payment,
      posted_date, terms, mop, payment_pattern, payment_history_profile, months_reviewed,
      source_text, is_collection_account, original_creditor_name, collection_agency_name, created_at
    )
    values (
      ${input.userId}, ${input.artifactId}, ${input.bureauId}, ${input.creditorId},
      ${input.accountNumber}, ${input.accountType}, ${input.status}, ${input.balance},
      ${input.currentBalance}, ${input.pastDue}, ${input.highCredit}, ${input.creditLimit},
      ${input.openedDate}, ${input.reportedDate}, ${input.closedDate}, ${input.dofd},
      ${input.lastPaymentDate}, ${input.postedDate}, ${input.terms}, ${input.mop},
      ${input.paymentPattern}, ${input.paymentPattern}, ${input.monthsReviewed}, ${input.sourceText},
      ${input.isCollectionAccount === true}, ${input.originalCreditorName ?? null},
      ${input.collectionAgencyName ?? null}, now()
    )
    returning id
  `;
  return Number(rows[0].id);
}

async function ensurePresence(sql: Sql, artifactId: number, tradelineId: number) {
  await sql`
    insert into public.tradeline_artifact_presence (report_artifact_id, tradeline_id)
    values (${artifactId}, ${tradelineId})
    on conflict (report_artifact_id, tradeline_id) do nothing
  `;
}

async function ensureViolation(sql: Sql, input: {
  tradelineId: number;
  creditorId: number;
  category: string;
  severity: string;
  explanation: string;
  vector: string;
  deadline: string;
}) {
  const existing = await sql`
    select id from public.creditor_obligation_test
    where tradeline_id = ${input.tradelineId}
      and violation_category = ${input.category}
    limit 1
  `;

  if (existing[0]?.id) {
    await sql`
      update public.creditor_obligation_test
      set severity = ${input.severity},
          user_explanation = ${input.explanation},
          dispute_vector = ${input.vector},
          response_deadline = ${input.deadline},
          updated_at = now()
      where id = ${Number(existing[0].id)}
    `;
    return Number(existing[0].id);
  }

  const rows = await sql`
    insert into public.creditor_obligation_test (
      tradeline_id, creditor_id, obligation_type, obligation_state, violation_category,
      user_status, severity, user_explanation, dispute_vector, statutory_basis,
      recommended_action, validation_status, response_deadline, confidence_score
    )
    values (
      ${input.tradelineId},
      ${input.creditorId},
      'ACCURACY_INTEGRITY',
      'OBLIGATION_PENDING',
      ${input.category},
      'active',
      ${input.severity},
      ${input.explanation},
      ${input.vector},
      'Canadian credit reporting accuracy and completeness requirement',
      'Generate a focused dispute package with source evidence attached.',
      'needs_review',
      ${input.deadline},
      92
    )
    returning id
  `;
  return Number(rows[0].id);
}

async function ensureObligation(sql: Sql, input: {
  userId: number;
  tradelineId: number;
  vector: string;
  state: string;
  deadline: string;
}) {
  const existing = await sql`
    select id from public.obligation_instance
    where tradeline_id = ${input.tradelineId}
      and dispute_vector = ${input.vector}
    limit 1
  `;
  if (existing[0]?.id) return Number(existing[0].id);

  const rows = await sql`
    insert into public.obligation_instance (
      user_id, tradeline_id, state, dispute_vector, challenge_sent_date, response_deadline, notes
    )
    values (
      ${input.userId},
      ${input.tradelineId},
      ${input.state},
      ${input.vector},
      now() - interval '7 days',
      ${input.deadline},
      'Local fixture dispute workflow'
    )
    returning id
  `;
  return Number(rows[0].id);
}

async function ensurePacket(sql: Sql, input: {
  userId: number;
  tradelineId: number;
  bureauId: number;
  violationId: number;
  label: string;
}) {
  const existing = await sql`
    select id from public.packet
    where tradeline_id = ${input.tradelineId}
      and terminal_label = ${input.label}
    limit 1
  `;
  if (existing[0]?.id) return Number(existing[0].id);

  const rows = await sql`
    insert into public.packet (
      user_id, tradeline_id, bureau_id, creditor_obligation_test_id, content, status,
      terminal_label, type, letter_date, sent_date, delivery_method, tracking_number,
      signature_mode, processing_status, region
    )
    values (
      ${input.userId},
      ${input.tradelineId},
      ${input.bureauId},
      ${input.violationId},
      'Local fixture dispute package content.',
      'sent',
      ${input.label},
      'bureau_dispute',
      now() - interval '7 days',
      now() - interval '6 days',
      'registered_mail',
      ${`LOCAL-${input.tradelineId}`},
      'typed',
      'completed',
      'CA'
    )
    returning id
  `;
  return Number(rows[0].id);
}

async function seedFixtureData(sql: Sql) {
  const admin = await sql`select id from public.users where role = 'admin' order by id limit 1`;
  const adminId = Number(admin[0]?.id);
  if (!Number.isFinite(adminId)) {
    throw new Error("No admin user found. Run pnpm run bootstrap:local-auth-schema first.");
  }

  const demoUserId = await ensureUser(
    sql,
    "local.demo.client@creditregulatorpro.local",
    "Local Demo Client",
    "user",
  );
  await ensureUser(sql, "local.support@creditregulatorpro.local", "Local Support Agent", "support");

  const transunionId = await ensureBureau(sql, "TransUnion Canada", "ON", "Toronto");
  const equifaxId = await ensureBureau(sql, "Equifax Canada", "ON", "Toronto");

  const scotiaId = await ensureCreditor(sql, "BANK OF NOVA SCOTIA");
  const capitalOneId = await ensureCreditor(sql, "CAPITAL ONE BANK");
  const telusId = await ensureCreditor(sql, "TELUS COMMUNICATIONS");
  const rogersId = await ensureCreditor(sql, "ROGERS BANK");

  const tuArtifactId = await ensureArtifact(sql, {
    key: "local-fixture-tu-disclosure-2026-01-10",
    userId: demoUserId,
    fileName: "TransUnion Local Fixture Consumer Disclosure.pdf",
    bureauName: "TransUnion Canada",
    reportDate: "2026-01-10T19:34:00-04:00",
  });
  const eqArtifactId = await ensureArtifact(sql, {
    key: "local-fixture-eq-disclosure-2026-01-10",
    userId: demoUserId,
    fileName: "Equifax Local Fixture Consumer Disclosure.pdf",
    bureauName: "Equifax Canada",
    reportDate: "2026-01-10T19:34:00-04:00",
  });

  const scotiaTradelineId = await ensureTradeline(sql, {
    userId: demoUserId,
    artifactId: tuArtifactId,
    bureauId: transunionId,
    creditorId: scotiaId,
    accountNumber: "LOCAL-BNS-2011",
    accountType: "INSTALLMENT / INDIVIDUAL",
    status: "closed",
    balance: 0,
    currentBalance: 0,
    pastDue: 0,
    highCredit: 31320,
    creditLimit: null,
    openedDate: "2011-09-03",
    reportedDate: "2013-10-31",
    closedDate: null,
    dofd: null,
    lastPaymentDate: "2013-10-03",
    postedDate: "2013-11-02",
    terms: "522/M",
    mop: "1",
    paymentPattern: "30:0 60:0 90:0 #M:26",
    monthsReviewed: "26",
    sourceText:
      "Creditor Name BANK OF NOVA SCOTIA. Reported Date Oct 31, 2013. Opened Date Sep 03, 2011. Last Payment Date Oct 03, 2013. Posted Date Nov 02, 2013. Terms 522/M. Account Type INSTALLMENT / INDIVIDUAL. Balance 0. Payment blank. Past Due 0. MOP 1. High Credit 31320. Credit Limit blank. Narrative AC.",
  });

  const capitalOneTuTradelineId = await ensureTradeline(sql, {
    userId: demoUserId,
    artifactId: tuArtifactId,
    bureauId: transunionId,
    creditorId: capitalOneId,
    accountNumber: "LOCAL-CAP1-3583",
    accountType: "REVOLVING / INDIVIDUAL",
    status: "charged off",
    balance: 248,
    currentBalance: 248,
    pastDue: 505,
    highCredit: 3583,
    creditLimit: 3000,
    openedDate: "2023-04-25",
    reportedDate: "2025-12-16",
    closedDate: "2024-06-17",
    dofd: "2023-12-16",
    lastPaymentDate: "2023-10-27",
    postedDate: "2025-12-18",
    terms: "0/M",
    mop: "R9",
    paymentPattern: "30:1 60:1 90:21 #M:32",
    monthsReviewed: "32",
    sourceText:
      "Creditor Name CAPITAL ONE BANK. Payment History 30 1 60 1 90 21 #M 32. Reported Date Dec 16, 2025. Opened Date Apr 25, 2023. Closed Date Jun 17, 2024. First Delinquency Date Dec 16, 2023. Last Payment Date Oct 27, 2023. Posted Date Dec 18, 2025. Terms 0/M. Account Type REVOLVING / INDIVIDUAL. Latest payment row Jul 2024 balance 248 payment 248 past due 505 high credit 3583.",
  });

  const telusTradelineId = await ensureTradeline(sql, {
    userId: demoUserId,
    artifactId: tuArtifactId,
    bureauId: transunionId,
    creditorId: telusId,
    accountNumber: "LOCAL-TELUS-2022",
    accountType: "OPEN / INDIVIDUAL",
    status: "collection",
    balance: 842,
    currentBalance: 842,
    pastDue: 842,
    highCredit: 842,
    creditLimit: null,
    openedDate: "2022-03-14",
    reportedDate: "2025-11-30",
    closedDate: null,
    dofd: "2022-09-01",
    lastPaymentDate: null,
    postedDate: "2025-12-05",
    terms: null,
    mop: "9",
    paymentPattern: "collection account",
    monthsReviewed: null,
    sourceText:
      "Creditor Name TELUS COMMUNICATIONS. Collection account. Balance 842. Past Due 842. Reported Date Nov 30, 2025. Date of First Delinquency Sep 01, 2022.",
    isCollectionAccount: true,
    collectionAgencyName: "TELUS COMMUNICATIONS",
  });

  const capitalOneEqTradelineId = await ensureTradeline(sql, {
    userId: demoUserId,
    artifactId: eqArtifactId,
    bureauId: equifaxId,
    creditorId: capitalOneId,
    accountNumber: "LOCAL-CAP1-3583",
    accountType: "REVOLVING / INDIVIDUAL",
    status: "charged off",
    balance: 248,
    currentBalance: 248,
    pastDue: 505,
    highCredit: 3583,
    creditLimit: 3000,
    openedDate: "2023-04-25",
    reportedDate: "2025-12-16",
    closedDate: "2024-06-17",
    dofd: "2023-12-16",
    lastPaymentDate: "2023-10-27",
    postedDate: "2025-12-18",
    terms: "0/M",
    mop: "R9",
    paymentPattern: "30:1 60:1 90:21 #M:32",
    monthsReviewed: "32",
    sourceText:
      "Equifax fixture mirror of CAPITAL ONE BANK for cross-bureau reconciliation testing.",
  });

  const rogersTradelineId = await ensureTradeline(sql, {
    userId: demoUserId,
    artifactId: eqArtifactId,
    bureauId: equifaxId,
    creditorId: rogersId,
    accountNumber: "LOCAL-ROGERS-2024",
    accountType: "REVOLVING / INDIVIDUAL",
    status: "open",
    balance: 119,
    currentBalance: 119,
    pastDue: 0,
    highCredit: 1000,
    creditLimit: 1000,
    openedDate: "2024-02-09",
    reportedDate: "2026-01-02",
    closedDate: null,
    dofd: null,
    lastPaymentDate: "2025-12-20",
    postedDate: "2026-01-03",
    terms: "0/M",
    mop: "1",
    paymentPattern: "30:0 60:0 90:0 #M:23",
    monthsReviewed: "23",
    sourceText:
      "Creditor Name ROGERS BANK. Open revolving account. Balance 119. Credit Limit 1000. Reported Date Jan 02, 2026.",
  });

  const tradelineIds = [
    scotiaTradelineId,
    capitalOneTuTradelineId,
    telusTradelineId,
    capitalOneEqTradelineId,
    rogersTradelineId,
  ];

  for (const id of [scotiaTradelineId, capitalOneTuTradelineId, telusTradelineId]) {
    await ensurePresence(sql, tuArtifactId, id);
  }
  for (const id of [capitalOneEqTradelineId, rogersTradelineId]) {
    await ensurePresence(sql, eqArtifactId, id);
  }

  await sql`
    update public.report_artifact
    set data = (
      case
        when jsonb_typeof(data) = 'object' then data
        else '{}'::jsonb
      end
    ) || jsonb_build_object(
      'tradelineIds',
      jsonb_build_array(${scotiaTradelineId}::bigint, ${capitalOneTuTradelineId}::bigint, ${telusTradelineId}::bigint)
    )
    where id = ${tuArtifactId}
  `;
  await sql`
    update public.report_artifact
    set data = (
      case
        when jsonb_typeof(data) = 'object' then data
        else '{}'::jsonb
      end
    ) || jsonb_build_object(
      'tradelineIds',
      jsonb_build_array(${capitalOneEqTradelineId}::bigint, ${rogersTradelineId}::bigint)
    )
    where id = ${eqArtifactId}
  `;

  const capViolationId = await ensureViolation(sql, {
    tradelineId: capitalOneTuTradelineId,
    creditorId: capitalOneId,
    category: "PAYMENT_HISTORY_MANIPULATION",
    severity: "HIGH",
    explanation:
      "Payment history and charge-off status require manual review against the source disclosure row.",
    vector: "payment-history-review",
    deadline: "2026-02-10",
  });

  const telusViolationId = await ensureViolation(sql, {
    tradelineId: telusTradelineId,
    creditorId: telusId,
    category: "COLLECTOR_LICENSE_FAILURE",
    severity: "MEDIUM",
    explanation:
      "Collection reporting should be checked against provincial collector licensing and retention requirements.",
    vector: "collector-license-review",
    deadline: "2026-02-20",
  });

  const capObligationId = await ensureObligation(sql, {
    userId: demoUserId,
    tradelineId: capitalOneTuTradelineId,
    vector: "payment-history-review",
    state: "CHALLENGED",
    deadline: "2026-02-10",
  });
  await ensureObligation(sql, {
    userId: demoUserId,
    tradelineId: telusTradelineId,
    vector: "collector-license-review",
    state: "OBLIGATION_PENDING",
    deadline: "2026-02-20",
  });

  await ensurePacket(sql, {
    userId: demoUserId,
    tradelineId: capitalOneTuTradelineId,
    bureauId: transunionId,
    violationId: capViolationId,
    label: "Local Capital One dispute",
  });
  await ensurePacket(sql, {
    userId: demoUserId,
    tradelineId: telusTradelineId,
    bureauId: transunionId,
    violationId: telusViolationId,
    label: "Local Telus collector review",
  });

  await sql`
    insert into public.success_metric (
      obligation_instance_id, creditor_id, bureau_id, dispute_vector, violation_category,
      outcome, final_state, response_time_days, escalation_count, region
    )
    select ${capObligationId}, ${capitalOneId}, ${transunionId}, 'payment-history-review',
           'PAYMENT_HISTORY_MANIPULATION', 'PARTIAL', 'CHALLENGED', 18, 1, 'CA'
    where not exists (
      select 1 from public.success_metric
      where obligation_instance_id = ${capObligationId}
        and outcome = 'PARTIAL'
    )
  `;

  await sql`
    insert into public.report_consumer_info (
      report_artifact_id, full_name, first_name, middle_name, last_name, city, province,
      postal_code, report_date, confidence_score, region
    )
    select ${tuArtifactId}, 'Local Demo Client', 'Local', 'Demo', 'Client', 'Halifax', 'NS',
           'B3H 0A1', '2026-01-10', 98, 'CA'
    where not exists (
      select 1 from public.report_consumer_info where report_artifact_id = ${tuArtifactId}
    )
  `;

  await sql`
    insert into public.tradeline_payment_history_detail (
      tradeline_id, report_artifact_id, period_date, balance, payment, past_due, mop,
      terms, high_credit, credit_limit, narrative, region
    )
    select ${scotiaTradelineId}, ${tuArtifactId}, '2013-10-01', 0, null, 0, '1',
           '522/M', 31320, null, 'AC', 'CA'
    where not exists (
      select 1 from public.tradeline_payment_history_detail
      where tradeline_id = ${scotiaTradelineId}
        and report_artifact_id = ${tuArtifactId}
    )
  `;

  await sql`
    insert into public.tradeline_payment_history_detail (
      tradeline_id, report_artifact_id, period_date, balance, payment, past_due, mop,
      terms, high_credit, credit_limit, narrative, region
    )
    select ${capitalOneTuTradelineId}, ${tuArtifactId}, '2024-07-01', 248, 248, 505, 'R9',
           '0/M', 3583, 3000, 'WO / CG', 'CA'
    where not exists (
      select 1 from public.tradeline_payment_history_detail
      where tradeline_id = ${capitalOneTuTradelineId}
        and report_artifact_id = ${tuArtifactId}
    )
  `;

  await sql`
    insert into public.audit_log (
      action_type, entity_type, entity_id, user_id, details, status, region
    )
    select 'CREATE', 'SYSTEM', null, ${adminId},
           jsonb_build_object(
             'source', ${FIXTURE_SOURCE}::text,
             'tradelineIds', jsonb_build_array(${tradelineIds[0]}::bigint, ${tradelineIds[1]}::bigint, ${tradelineIds[2]}::bigint, ${tradelineIds[3]}::bigint, ${tradelineIds[4]}::bigint)
           ),
           'SUCCESS', 'CA'
    where not exists (
      select 1 from public.audit_log
      where details ->> 'source' = ${FIXTURE_SOURCE}
    )
  `;

  return {
    users: 3,
    artifacts: 2,
    tradelines: tradelineIds.length,
    violations: 2,
    packets: 2,
  };
}

async function main() {
  const databaseUrl = requireLocalDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });

  try {
    await requireAuthBootstrap(sql);
    await createCoreAppTables(sql);
    const seeded = await seedFixtureData(sql);
    console.log("Local app fixture bootstrap complete.");
    console.log(
      `Seeded/verified users=${seeded.users}, artifacts=${seeded.artifacts}, tradelines=${seeded.tradelines}, violations=${seeded.violations}, packets=${seeded.packets}.`,
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
