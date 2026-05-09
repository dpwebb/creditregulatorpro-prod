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

function parseOpenAiJsonPayload(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fenced = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
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
      const errorCode = `openai_http_${response.status}`;
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

    const parsed = options.parseOutput(parseOpenAiJsonPayload(content));

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
