import fs from 'fs'

function applyEnvConfig(envConfig, options = {}) {
  const overrideExisting = options.overrideExisting === true;
  const preserveExistingKeys = new Set(options.preserveExistingKeys || []);
  Object.keys(envConfig).forEach((key) => {
    if (preserveExistingKeys.has(key) && process.env[key]) {
      return;
    }
    if (
      envConfig[key] != null &&
      envConfig[key] !== '' &&
      (overrideExisting || !process.env[key])
    ) {
      process.env[key] = envConfig[key];
    }
  });
}

function parseEnvFile(contents) {
  const envConfig = {};

  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      return;
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    envConfig[match[1]] = value;
  });

  return envConfig;
}

function isPlaceholderValue(value) {
  return /mask|placeholder|changeme|todo|example/i.test(value || "");
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

function isLocalDevBootstrapEnabled() {
  return !isProductionRuntime() && process.env.CRP_LOCAL_DEV === 'true';
}

if (!isProductionRuntime() && fs.existsSync('env.json')) {
  const envConfig = JSON.parse(fs.readFileSync('env.json', 'utf8'));

  // Local project config should be authoritative for this repository in dev/runtime.
  // Keep explicit runtime overrides for host/port URLs so local starts can pin expected endpoints.
  applyEnvConfig(envConfig, {
    overrideExisting: true,
    preserveExistingKeys: ["APP_BASE_URL", "PREVIEW_URL"],
  });
}

if (
  isLocalDevBootstrapEnabled() &&
  process.env.GLOBAL_SECRETS_PATH &&
  fs.existsSync(process.env.GLOBAL_SECRETS_PATH)
) {
  const globalEnvConfig = parseEnvFile(fs.readFileSync(process.env.GLOBAL_SECRETS_PATH, 'utf8'));

  // Ensure local runtime always uses current global-secrets values, not stale ambient env values.
  applyEnvConfig(globalEnvConfig, {
    overrideExisting: true,
    preserveExistingKeys: ["PORT", "APP_BASE_URL", "PREVIEW_URL", "LOCAL_DATABASE_NAME"],
  });
}

if (isLocalDevBootstrapEnabled()) {
  // In local dev, prefer DATABASE_URL as the canonical source for DB credentials.
  // This prevents stale FLOOT_DATABASE_URL values in env.json from persisting across sessions.
  if (process.env.DATABASE_URL && isValidUrl(process.env.DATABASE_URL)) {
    process.env.FLOOT_DATABASE_URL = process.env.DATABASE_URL;
  } else if (
    !process.env.FLOOT_DATABASE_URL ||
    isPlaceholderValue(process.env.FLOOT_DATABASE_URL) ||
    !isValidUrl(process.env.FLOOT_DATABASE_URL)
  ) {
    process.env.FLOOT_DATABASE_URL = process.env.DATABASE_URL;
  }

  if (process.env.LOCAL_DATABASE_NAME && process.env.FLOOT_DATABASE_URL && isValidUrl(process.env.FLOOT_DATABASE_URL)) {
    const databaseUrl = new URL(process.env.FLOOT_DATABASE_URL);
    databaseUrl.pathname = `/${process.env.LOCAL_DATABASE_NAME}`;
    process.env.FLOOT_DATABASE_URL = databaseUrl.toString();
  }
}
