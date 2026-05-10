export const DEFAULT_LOCAL_ADMIN_EMAIL = "webbd3500@gmail.com";
export const DEFAULT_LOCAL_ADMIN_PASSWORD = "LocalAdmin123";
export const DEFAULT_LOCAL_ADMIN_NAME = "Admin";
export const DEFAULT_LOCAL_ADMIN_SIGNATURE = "DAVID PHILIP WEBB";

export type LocalAdminAuth = {
  email: string;
  password: string;
  displayName: string;
  legalNameSignature: string;
};

export function resolveLocalAdminAuth(env: Record<string, string | undefined> = process.env): LocalAdminAuth {
  return {
    email: (env.LOCAL_DEV_ADMIN_EMAIL || DEFAULT_LOCAL_ADMIN_EMAIL).trim().toLowerCase(),
    password: env.LOCAL_DEV_ADMIN_PASSWORD || DEFAULT_LOCAL_ADMIN_PASSWORD,
    displayName: env.LOCAL_DEV_ADMIN_NAME || DEFAULT_LOCAL_ADMIN_NAME,
    legalNameSignature: env.LOCAL_DEV_ADMIN_SIGNATURE || DEFAULT_LOCAL_ADMIN_SIGNATURE,
  };
}

export function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
