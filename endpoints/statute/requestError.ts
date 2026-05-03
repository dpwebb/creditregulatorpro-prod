export async function readStatuteRequestError(result: Response): Promise<string> {
  const fallback = `Request failed (${result.status})`;
  const text = await result.text();
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // Non-JSON response body.
  }

  return text.trim() || fallback;
}
