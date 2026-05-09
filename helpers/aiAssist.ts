import { db } from "./db";
import {
  AiAssistRunStatus,
  recordAiAssistRun,
} from "./aiAssistRunStore";

export interface AiAssistFeatureContext {
  featureKey: string;
  userRole?: "admin" | "user" | "support" | string | null;
}

export interface OpenAiJsonAssistOptions<T> extends AiAssistFeatureContext {
  subjectType: string;
  subjectId?: number | null;
  userId?: number | null;
  systemPrompt: string;
  userPrompt: string;
  inputForHash: unknown;
  parseOutput: (value: unknown) => T;
  timeoutMs?: number;
}

export interface AiAssistResult<T> {
  status: AiAssistRunStatus;
  provider: "openai" | "none";
  model: string | null;
  output: T | null;
  errorCode?: string | null;
}

function parseBooleanSetting(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "enabled", "on", "yes"].includes(value.trim().toLowerCase());
}

export async function isAiAssistFeatureEnabled({
  featureKey,
  userRole,
}: AiAssistFeatureContext): Promise<boolean> {
  try {
    const flag = await db
      .selectFrom("featureFlag")
      .select(["enabled", "scope"])
      .where("key", "=", featureKey)
      .executeTakeFirst();

    if (flag) {
      if (!flag.enabled) return false;
      if (flag.scope === "admin") return userRole === "admin" || userRole === "support";
      return true;
    }

    const setting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", featureKey)
      .executeTakeFirst();

    return parseBooleanSetting(setting?.value);
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "WARN",
        component: "aiAssist",
        message: "AI assist feature check failed closed",
        featureKey,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}

function parseJsonCandidate(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return null;
  }
}

function extractFirstBalancedJsonObject(rawContent: string): string | null {
  const start = rawContent.search(/[{\[]/);
  if (start === -1) return null;

  const opening = rawContent[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < rawContent.length; index += 1) {
    const char = rawContent[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return rawContent.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseOpenAiJsonPayload(rawContent: string): unknown {
  const direct = parseJsonCandidate(rawContent);
  if (direct !== null) return direct;

  const fenced = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const fencedParsed = parseJsonCandidate(fenced[1]);
    if (fencedParsed !== null) return fencedParsed;
  }

  const embedded = extractFirstBalancedJsonObject(fenced?.[1] ?? rawContent);
  if (embedded) {
    const embeddedParsed = parseJsonCandidate(embedded);
    if (embeddedParsed !== null) return embeddedParsed;
  }

  throw new Error("openai_json_parse_failed");
}

function getApiErrorMessage(responseText: string, status: number): string {
  const parsed = parseJsonCandidate(responseText);
  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "string"
  ) {
    return (parsed as { error: string }).error.slice(0, 160);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "object"
  ) {
    const error = (parsed as { error?: { message?: unknown; code?: unknown } }).error;
    if (typeof error?.code === "string") return error.code;
    if (typeof error?.message === "string") return error.message.slice(0, 160);
  }

  return `openai_http_${status}`;
}

/*
 * Parse model JSON without letting provider formatting quirks leak raw
 * JavaScript parser messages into the admin UI.
 */
function parseAssistPayload(rawContent: string): unknown {
  try {
    return parseOpenAiJsonPayload(rawContent);
  } catch (error) {
    if (error instanceof Error && error.message === "openai_json_parse_failed") {
      throw error;
    }
    throw new Error("openai_json_parse_failed");
  }
}

export async function runOpenAiJsonAssist<T>(
  options: OpenAiJsonAssistOptions<T>,
): Promise<AiAssistResult<T>> {
  const enabled = await isAiAssistFeatureEnabled({
    featureKey: options.featureKey,
    userRole: options.userRole,
  });

  if (!enabled) {
    await recordAiAssistRun({
      featureKey: options.featureKey,
      subjectType: options.subjectType,
      subjectId: options.subjectId ?? null,
      userId: options.userId ?? null,
      provider: "none",
      model: null,
      status: "disabled",
      input: options.inputForHash,
    });
    return { status: "disabled", provider: "none", model: null, output: null };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_ASSIST_OPENAI_MODEL || "gpt-5-mini";

  if (!apiKey) {
    await recordAiAssistRun({
      featureKey: options.featureKey,
      subjectType: options.subjectType,
      subjectId: options.subjectId ?? null,
      userId: options.userId ?? null,
      provider: "openai",
      model,
      status: "unavailable",
      input: options.inputForHash,
      errorCode: "missing_openai_api_key",
    });
    return {
      status: "unavailable",
      provider: "openai",
      model,
      output: null,
      errorCode: "missing_openai_api_key",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      const errorCode = getApiErrorMessage(responseText, response.status);
      await recordAiAssistRun({
        featureKey: options.featureKey,
        subjectType: options.subjectType,
        subjectId: options.subjectId ?? null,
        userId: options.userId ?? null,
        provider: "openai",
        model,
        status: "failed",
        input: options.inputForHash,
        errorCode,
      });
      return { status: "failed", provider: "openai", model, output: null, errorCode };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("openai_empty_content");
    }

    const parsed = options.parseOutput(parseAssistPayload(content));

    await recordAiAssistRun({
      featureKey: options.featureKey,
      subjectType: options.subjectType,
      subjectId: options.subjectId ?? null,
      userId: options.userId ?? null,
      provider: "openai",
      model,
      status: "ok",
      input: options.inputForHash,
      outputJson: parsed,
    });

    return { status: "ok", provider: "openai", model, output: parsed };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "openai_assist_failed";
    await recordAiAssistRun({
      featureKey: options.featureKey,
      subjectType: options.subjectType,
      subjectId: options.subjectId ?? null,
      userId: options.userId ?? null,
      provider: "openai",
      model,
      status: "failed",
      input: options.inputForHash,
      errorCode,
    });
    return { status: "failed", provider: "openai", model, output: null, errorCode };
  } finally {
    clearTimeout(timeout);
  }
}
