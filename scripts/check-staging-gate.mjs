const DEFAULT_STAGING_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_TIMEOUT_MS = 15000;

const appBaseUrl = process.env.STAGING_APP_URL || DEFAULT_STAGING_URL;
const apiBaseUrl = process.env.STAGING_API_URL || appBaseUrl;
const timeoutMs = Number(process.env.STAGING_GATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

function fail(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function toAbsoluteUrl(baseUrl, pathname) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathname, normalizedBase).toString();
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "creditregulatorpro-staging-gate/1.0",
        ...(init.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function assertStatus(name, response, acceptedStatuses) {
  if (!acceptedStatuses.includes(response.status)) {
    const allowed = acceptedStatuses.join(", ");
    throw new Error(`${name} returned HTTP ${response.status}; expected one of [${allowed}]`);
  }
}

async function run() {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    fail(`invalid STAGING_GATE_TIMEOUT_MS '${process.env.STAGING_GATE_TIMEOUT_MS || ""}'`);
  }

  console.log(`Staging app URL: ${appBaseUrl}`);
  console.log(`Staging API URL: ${apiBaseUrl}`);
  console.log(`Timeout: ${timeoutMs}ms`);

  const checks = [
    {
      name: "App shell",
      url: toAbsoluteUrl(appBaseUrl, "/"),
      acceptedStatuses: [200],
    },
    {
      name: "Login route",
      url: toAbsoluteUrl(appBaseUrl, "/login"),
      acceptedStatuses: [200],
    },
    {
      name: "Auth session endpoint",
      url: toAbsoluteUrl(apiBaseUrl, "/_api/auth/session"),
      acceptedStatuses: [200, 401, 403],
    },
    {
      name: "Lifecycle admin endpoint",
      url: toAbsoluteUrl(apiBaseUrl, "/_api/admin/mock-lifecycle/list?limit=1"),
      acceptedStatuses: [200, 401, 403],
    },
  ];

  for (const check of checks) {
    const response = await fetchWithTimeout(check.url, { method: "GET" });
    assertStatus(check.name, response, check.acceptedStatuses);
    console.log(`[OK] ${check.name}: HTTP ${response.status}`);
  }

  console.log("Staging validation gate passed.");
}

run().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
