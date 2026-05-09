import { sql } from "kysely";
import { db } from "./db";
import { sha256HexOfBase64Payload } from "./reportBinaryUtils";

type ParserTestCaseTrainingSource = {
  id: number;
  name: string;
  bureau: string | null;
  parserMode: string | null;
  stageVersion: string | null;
  extractionSource: string | null;
  parserContext: unknown;
  adjudicationDecisions: unknown;
  pdfBase64?: string;
};

export type ParserTestTrainingArchiveItem = {
  sourceTestCaseId: number;
  sourceTestCaseName: string;
  bureau: string | null;
  parserMode: string | null;
  stageVersion: string | null;
  extractionSource: string | null;
  trainingLabel: string | null;
  trainingNote: string | null;
  trainingNoteOnly: boolean;
  useForTraining: boolean;
  payload: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getParserTestCaseSourceSha256s(testCase: Pick<
  ParserTestCaseTrainingSource,
  "parserContext" | "pdfBase64"
>): string[] {
  const sha256s = new Set<string>();
  const context = asRecord(testCase.parserContext);
  const retention = asRecord(context?.retention);
  const provenance = asRecord(context?.provenance);
  const candidates = [
    context?.originalDocumentSha256,
    retention?.originalDocumentSha256,
    retention?.documentBinarySha256,
    provenance?.documentBinarySha256,
  ];

  for (const candidate of candidates) {
    const normalized = stringOrNull(candidate);
    if (normalized) sha256s.add(normalized);
  }

  if (testCase.pdfBase64) {
    try {
      sha256s.add(sha256HexOfBase64Payload(testCase.pdfBase64));
    } catch {
      // The parser context hash is enough for Stage Lab cases; malformed legacy payloads
      // should not block test-case deletion.
    }
  }

  return [...sha256s];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function booleanValue(record: Record<string, unknown>, camelKey: string, snakeKey: string): boolean {
  const value = record[camelKey] ?? record[snakeKey];
  return value === true || value === "true";
}

export function extractParserTestTrainingArchiveItems(
  testCase: ParserTestCaseTrainingSource,
): ParserTestTrainingArchiveItem[] {
  return asArray(testCase.adjudicationDecisions).flatMap((entry) => {
    const decision = asRecord(entry);
    if (!decision) return [];

    const useForTraining = booleanValue(decision, "useForTraining", "use_for_training");
    const trainingNoteOnly = booleanValue(decision, "trainingNoteOnly", "training_note_only");
    const trainingNote =
      stringOrNull(decision.trainingNote) ??
      stringOrNull(decision.training_note) ??
      (trainingNoteOnly ? stringOrNull(decision.reason) : null);

    if (!useForTraining && !trainingNoteOnly && !trainingNote) return [];

    return [
      {
        sourceTestCaseId: testCase.id,
        sourceTestCaseName: testCase.name,
        bureau: testCase.bureau,
        parserMode: testCase.parserMode,
        stageVersion: testCase.stageVersion,
        extractionSource: testCase.extractionSource,
        trainingLabel:
          stringOrNull(decision.trainingLabel) ?? stringOrNull(decision.training_label),
        trainingNote,
        trainingNoteOnly,
        useForTraining,
        payload: {
          source: "parser_test_case_delete",
          sourceTestCase: {
            id: testCase.id,
            name: testCase.name,
            bureau: testCase.bureau,
            parserMode: testCase.parserMode,
            stageVersion: testCase.stageVersion,
            extractionSource: testCase.extractionSource,
          },
          parserContext: testCase.parserContext ?? null,
          decision,
        },
      },
    ];
  });
}

export async function ensureParserTestTrainingArchiveSchema(): Promise<void> {
  await sql`
    create table if not exists public.parser_test_training_archive (
      id bigserial primary key,
      source_test_case_id bigint null,
      source_test_case_name text not null,
      bureau text null,
      parser_mode text null,
      stage_version text null,
      extraction_source text null,
      training_label text null,
      training_note text null,
      training_note_only boolean not null default false,
      use_for_training boolean not null default true,
      training_payload jsonb not null,
      created_by_admin_id bigint null references public.users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  // Existing staging databases may already have this table from an older delete/archive build.
  await sql`
    alter table public.parser_test_training_archive
      add column if not exists source_test_case_id bigint null,
      add column if not exists source_test_case_name text null,
      add column if not exists bureau text null,
      add column if not exists parser_mode text null,
      add column if not exists stage_version text null,
      add column if not exists extraction_source text null,
      add column if not exists training_label text null,
      add column if not exists training_note text null,
      add column if not exists training_note_only boolean null default false,
      add column if not exists use_for_training boolean null default true,
      add column if not exists training_payload jsonb null,
      add column if not exists created_by_admin_id bigint null,
      add column if not exists created_at timestamptz null default now()
  `.execute(db);

  await sql`
    update public.parser_test_training_archive
    set
      source_test_case_name = coalesce(
        nullif(source_test_case_name, ''),
        case
          when source_test_case_id is not null then 'Parser test case #' || source_test_case_id::text
          else 'Unknown parser test case'
        end
      ),
      training_note_only = coalesce(training_note_only, false),
      use_for_training = coalesce(use_for_training, true),
      training_payload = coalesce(training_payload, '{}'::jsonb),
      created_at = coalesce(created_at, now())
    where
      source_test_case_name is null
      or source_test_case_name = ''
      or training_note_only is null
      or use_for_training is null
      or training_payload is null
      or created_at is null
  `.execute(db);

  await sql`
    alter table public.parser_test_training_archive
      alter column source_test_case_name set not null,
      alter column training_note_only set default false,
      alter column training_note_only set not null,
      alter column use_for_training set default true,
      alter column use_for_training set not null,
      alter column training_payload set not null,
      alter column created_at set default now(),
      alter column created_at set not null
  `.execute(db);

  await sql`
    create index if not exists idx_parser_test_training_archive_source
      on public.parser_test_training_archive(source_test_case_id)
  `.execute(db);

  await sql`
    create index if not exists idx_parser_test_training_archive_use
      on public.parser_test_training_archive(use_for_training, training_note_only)
  `.execute(db);
}
