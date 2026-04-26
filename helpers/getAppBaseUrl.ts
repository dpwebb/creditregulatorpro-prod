export function getAppBaseUrl(request: Request): string {
  return (
    process.env.APP_BASE_URL?.replace(/\/+$/, "") ??
    new URL(request.url).origin
  );
}
