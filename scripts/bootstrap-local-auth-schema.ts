import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

type EnvMap = Record<string, string>;

function parseDotEnv(contents: string): EnvMap {
  const out: EnvMap = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function resolveLocalDatabaseUrl(): string {
  const envJsonPath = path.resolve("env.json");
  if (!fs.existsSync(envJsonPath)) {
    throw new Error("env.json not found");
  }

  const envJson = JSON.parse(fs.readFileSync(envJsonPath, "utf8")) as {
    GLOBAL_SECRETS_PATH?: string;
    LOCAL_DATABASE_NAME?: string;
    FLOOT_DATABASE_URL?: string;
  };

  const globalPath = envJson.GLOBAL_SECRETS_PATH;
  const globalEnv =
    globalPath && fs.existsSync(globalPath)
      ? parseDotEnv(fs.readFileSync(globalPath, "utf8"))
      : {};

  if (globalEnv.DATABASE_URL) {
    const url = new URL(globalEnv.DATABASE_URL);
    if (envJson.LOCAL_DATABASE_NAME) {
      url.pathname = `/${envJson.LOCAL_DATABASE_NAME}`;
    }
    return url.toString();
  }

  if (envJson.FLOOT_DATABASE_URL) {
    return envJson.FLOOT_DATABASE_URL;
  }

  throw new Error("No local database URL could be resolved.");
}

async function main() {
  const databaseUrl = resolveLocalDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });

  try {
    await sql`create table if not exists public.users (
      id bigserial primary key,
      email text not null unique,
      display_name text not null,
      role text not null default 'user',
      organization_id bigint null,
      avatar_url text null,
      email_verified boolean not null default false,
      created_at timestamptz not null default now()
    )`;

    await sql`create table if not exists public.user_passwords (
      user_id bigint primary key references public.users(id) on delete cascade,
      password_hash text not null
    )`;

    await sql`create table if not exists public.subscriptions (
      id bigserial primary key,
      user_id bigint not null references public.users(id) on delete cascade,
      plan text not null default 'beta',
      status text not null default 'active',
      trial_start timestamptz not null default now(),
      trial_end timestamptz not null default now() + interval '100 years',
      stripe_customer_id text null,
      stripe_subscription_id text null,
      current_period_start timestamptz null,
      current_period_end timestamptz null,
      cancelled_at timestamptz null,
      cancel_reason text null,
      renewal_reminder_sent_at timestamptz null,
      price_cad numeric null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;

    await sql`create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id)`;

    await sql`create table if not exists public.user_account (
      id bigserial primary key,
      user_id bigint unique references public.users(id) on delete set null,
      email text not null,
      full_name text null,
      legal_name_signature text null,
      address_line1 text null,
      address_line2 text null,
      city text null,
      province text null,
      postal_code text null,
      date_of_birth timestamptz null,
      phone text null,
      role text null default 'user',
      region text null default 'CA',
      terms_accepted_at timestamptz null,
      terms_accepted_version text null default null,
      created_at timestamptz null default now()
    )`;

    await sql`create table if not exists public.sessions (
      id text primary key,
      user_id bigint not null references public.users(id) on delete cascade,
      created_at timestamptz not null,
      last_accessed timestamptz not null,
      expires_at timestamptz not null
    )`;

    await sql`create index if not exists idx_sessions_user_id on public.sessions(user_id)`;
    await sql`create index if not exists idx_sessions_expires_at on public.sessions(expires_at)`;

    await sql`create table if not exists public.login_attempts (
      id bigserial primary key,
      email text not null,
      attempted_at timestamptz not null,
      success boolean not null
    )`;
    await sql`create index if not exists idx_login_attempts_email_attempted_at on public.login_attempts(email, attempted_at desc)`;

    await sql`create table if not exists public.rate_limit_entry (
      identifier text not null,
      action text not null,
      count integer not null default 0,
      reset_at timestamptz not null,
      primary key (identifier, action)
    )`;

    await sql`create table if not exists public.audit_log (
      id bigserial primary key,
      action_type text not null,
      entity_type text not null,
      entity_id bigint null,
      user_id bigint null,
      details jsonb null,
      status text not null default 'SUCCESS',
      error_message text null,
      ip_address text null,
      user_agent text null,
      region text not null default 'CA',
      "timestamp" timestamptz not null default now()
    )`;

    await sql`create table if not exists public.email_verification_tokens (
      id bigserial primary key,
      user_id bigint not null references public.users(id) on delete cascade,
      token text not null unique,
      expires_at timestamptz not null,
      verified boolean not null default false,
      created_at timestamptz not null default now()
    )`;

    await sql`create table if not exists public.password_reset_tokens (
      id bigserial primary key,
      user_id bigint not null references public.users(id) on delete cascade,
      token text not null unique,
      expires_at timestamptz not null,
      used boolean not null default false,
      created_at timestamptz not null default now()
    )`;

    await sql`insert into public.system_settings(key, value, description, updated_at, updated_by_user_id)
      values
        ('production_mode', 'false', 'local mode', now(), null),
        ('terms_version', 'v1', 'terms version', now(), null),
        ('DOMAIN_GUARD_MODE', 'log_only', 'origin guard mode', now(), null)
      on conflict (key) do update set value = excluded.value, updated_at = now()`;

    console.log("Local auth schema bootstrap complete.");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

