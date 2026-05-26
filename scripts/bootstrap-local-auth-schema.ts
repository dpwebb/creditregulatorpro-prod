import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { hash } from "bcryptjs";
import { resolveLocalAdminAuth } from "./localAdminAuth";

type EnvMap = Record<string, string>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

function readOptionalEnvJson(): EnvMap {
  const envJsonPath = path.resolve("env.json");
  if (!fs.existsSync(envJsonPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(envJsonPath, "utf8")) as EnvMap;
}

function resolveLocalDatabaseUrl(): string {
  const envJsonPath = path.resolve("env.json");
  const explicitDatabaseUrl = process.env.FLOOT_DATABASE_URL || process.env.DATABASE_URL;
  if (explicitDatabaseUrl) {
    return explicitDatabaseUrl;
  }

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

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on", "enabled"].includes(value.trim().toLowerCase());
}

async function main() {
  const databaseUrl = resolveLocalDatabaseUrl();
  const envJson = readOptionalEnvJson();
  const databaseHost = new URL(databaseUrl).hostname;
  const isExplicitLocalDev = isTruthy(process.env.CRP_LOCAL_DEV) || isTruthy(envJson.CRP_LOCAL_DEV);

  if (!isExplicitLocalDev) {
    throw new Error("Refusing to bootstrap local admin unless CRP_LOCAL_DEV=true.");
  }

  if (!LOCAL_HOSTS.has(databaseHost)) {
    throw new Error(`Refusing to bootstrap local admin for non-local database host: ${databaseHost}.`);
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  const localAdminAuth = resolveLocalAdminAuth(process.env);
  const localAdminEmail = localAdminAuth.email;
  const localAdminPassword = localAdminAuth.password;
  const localAdminDisplayName = localAdminAuth.displayName;
  const localAdminSignature = localAdminAuth.legalNameSignature;
  const shouldNormalizeLocalAdmins =
    (process.env.LOCAL_DEV_SINGLE_ADMIN ?? envJson.LOCAL_DEV_SINGLE_ADMIN ?? "true").trim().toLowerCase() !== "false";
  const canNormalizeLocalAdmins = shouldNormalizeLocalAdmins;

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

    await sql`create table if not exists public.consumer_identification_document (
      id bigserial primary key,
      user_id bigint not null unique references public.users(id) on delete cascade,
      file_name text not null,
      file_type text not null,
      file_size_bytes integer not null,
      storage_url text not null,
      sha256 text not null,
      region text not null default 'CA',
      uploaded_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;

    await sql`create index if not exists idx_consumer_identification_document_user_id on public.consumer_identification_document(user_id)`;

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

    // Seed/reset a deterministic local admin account to prevent localhost login lockouts
    // after database/environment resets.
    const passwordHash = await hash(localAdminPassword, 12);
    const adminRows = await sql`
      insert into public.users (email, display_name, role, email_verified)
      values (${localAdminEmail}, ${localAdminDisplayName}, 'admin', true)
      on conflict (email)
      do update set
        display_name = coalesce(nullif(public.users.display_name, ''), excluded.display_name),
        role = 'admin',
        email_verified = true
      returning id
    `;
    const adminId = Number(adminRows[0]?.id);

    if (!Number.isFinite(adminId)) {
      throw new Error("Failed to resolve seeded local admin user id.");
    }

    await sql`
      insert into public.user_passwords (user_id, password_hash)
      values (${adminId}, ${passwordHash})
      on conflict (user_id)
      do update set password_hash = excluded.password_hash
    `;

    await sql`
      insert into public.user_account (
        user_id,
        email,
        full_name,
        legal_name_signature,
        role,
        region,
        terms_accepted_at,
        terms_accepted_version
      )
      values (
        ${adminId},
        ${localAdminEmail},
        ${localAdminDisplayName},
        ${localAdminSignature},
        'admin',
        'CA',
        now(),
        'v1'
      )
      on conflict (user_id)
      do update set
        email = excluded.email,
        full_name = coalesce(nullif(public.user_account.full_name, ''), excluded.full_name),
        legal_name_signature = coalesce(nullif(public.user_account.legal_name_signature, ''), excluded.legal_name_signature),
        role = 'admin',
        region = 'CA',
        terms_accepted_at = coalesce(public.user_account.terms_accepted_at, now()),
        terms_accepted_version = coalesce(public.user_account.terms_accepted_version, 'v1')
    `;

    if (canNormalizeLocalAdmins) {
      const demotedUsers = await sql`
        update public.users
        set role = 'support'
        where role = 'admin'
          and lower(email) <> ${localAdminEmail}
        returning id, email
      `;

      if (demotedUsers.length > 0) {
        await sql`
          update public.user_account ua
          set role = 'support'
          from public.users u
          where ua.user_id = u.id
            and u.role = 'support'
            and lower(u.email) <> ${localAdminEmail}
            and ua.role = 'admin'
        `;
      }

      console.log(`Normalized localhost admin accounts: demoted ${demotedUsers.length} non-canonical admin account(s) to support.`);
    }

    console.log("Local auth schema bootstrap complete.");
    console.log(`Seeded local admin email: ${localAdminEmail}`);
    console.log("Seeded local admin password: (value from LOCAL_DEV_ADMIN_PASSWORD or default)");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
