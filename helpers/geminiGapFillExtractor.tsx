import { db } from "./db";
import { z } from "zod";

interface GeminiContent {
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    };
  }>;
}

interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
}

interface GeminiRequest {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message: string;
  };
}

const gapFillResponseSchema = z.array(
  z.object({
        creditorName: z.string(),
    accountNumber: z.string().nullable().optional(),
    fields: z.record(z.string(), z.string().nullable()),
  })
);

const FIELDS_TO_CHECK = [
  "openedDate",
  "chargeOffDate",
  "dateClosed",
  "dateOfFirstDelinquency",
  "accountNumber",
  "dateOfLastPayment",
  "lastActivityDate",
  "balloonPaymentDate",
  "maturityDate",
] as const;

type TradelineField = (typeof FIELDS_TO_CHECK)[number];

export async function gapFillTradelines(
  artifactId: number,
  tradelineIds: number[]
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  if (!tradelineIds.length) {
    return { updated, errors };
  }

  try {
    // 1. Load the raw PDF base64 from report_artifact
    const artifact = await db
      .selectFrom("reportArtifact")
      .select(["storageUrl", "id"])
      .where("id", "=", artifactId)
      .executeTakeFirst();

    if (!artifact?.storageUrl) {
      errors.push(`Artifact ${artifactId} not found or missing storageUrl`);
      return { updated, errors };
    }

    let base64Data = artifact.storageUrl;
    // Strip data URI prefix if present
    if (base64Data.startsWith("data:")) {
      const parts = base64Data.split(",");
      if (parts.length > 1) {
        base64Data = parts[1];
      }
    }

    // 2. Load the tradelines by their IDs
    const tradelines = await db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .select([
        "tradeline.id",
        "tradeline.accountNumber",
        "creditor.name as creditorName",
        "tradeline.originalCreditorName",
        "tradeline.sourceText",
        "tradeline.openedDate",
        "tradeline.chargeOffDate",
        "tradeline.dateClosed",
        "tradeline.dateOfFirstDelinquency",
        "tradeline.dateOfLastPayment",
        "tradeline.lastActivityDate",
        "tradeline.balloonPaymentDate",
        "tradeline.maturityDate",
      ])
      .where("tradeline.id", "in", tradelineIds)
      .execute();

    // 3. Identify missing fields
    const targets: Array<{
      id: number;
      name: string;
      accountNumber: string;
      missing: string[];
    }> = [];

    for (const tl of tradelines) {
      const missing: string[] = [];

      for (const field of FIELDS_TO_CHECK) {
        // accountNumber is a special case: we only want to extract it if it's "Unknown" or truly empty
        if (field === "accountNumber") {
          if (!tl.accountNumber || tl.accountNumber.toLowerCase() === "unknown") {
            missing.push("accountNumber");
          }
        } else {
          // For dates, check if null
          if (tl[field] === null || tl[field] === undefined) {
            missing.push(field);
          }
        }
      }

      if (missing.length > 0) {
        targets.push({
          id: tl.id,
          name: tl.creditorName || tl.originalCreditorName || "Unknown Creditor",
          accountNumber: tl.accountNumber || "Unknown",
          missing,
        });
      }
    }

    // 4. Early return if no missing fields
    if (targets.length === 0) {
      console.log(`[Gap Fill] No missing target fields found for tradelines`);
      return { updated, errors };
    }

    // 5. Build a targeted Gemini prompt
    const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;
    if (!apiKey) {
      errors.push("GOOGLE_GEMINI_SA_KEY not configured");
      return { updated, errors };
    }

    const promptText = `You are an expert data extraction assistant analyzing a credit report PDF.
Your task is to find specific MISSING fields for certain accounts.

CRITICAL INSTRUCTIONS:
- You must return ONLY valid JSON matching the requested format.
- Dates MUST be formatted as strictly 'YYYY-MM-DD'. If only month and year are available, use 'YYYY-MM-01'.
- If a requested field cannot be found, set its value to null.
- Do NOT make up data.

ACCOUNTS TO CHECK:
${targets
  .map(
    (t) =>
      `- Creditor: "${t.name}" (Account: ${t.accountNumber}). Missing fields to find: ${t.missing.join(", ")}`
  )
  .join("\n")}

OUTPUT FORMAT (JSON Array):
[
  {
    "creditorName": "Name from the list above",
    "accountNumber": "Account number from the list above",
    "fields": {
      "fieldName": "extracted_value_or_null"
    }
  }
]`;

    console.log(`[Gap Fill] Prompting Gemini for ${targets.length} accounts...`);

    const requestBody: GeminiRequest = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1, // Deterministic
        responseMimeType: "application/json",
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(`Gemini returned error: ${data.error.message}`);
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("No text content in Gemini response");
    }

    // 6. Parse the Gemini JSON response
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (e) {
      // Fallback: try removing markdown code blocks if the responseMimeType didn't work
      const cleanJson = responseText
        .replace(/^```json/im, "")
        .replace(/^```/im, "")
        .replace(/```$/im, "")
        .trim();
      parsedJson = JSON.parse(cleanJson);
    }

    const validationResult = gapFillResponseSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      throw new Error(
        `Failed to parse Gemini response: ${validationResult.error.message}`
      );
    }

    const extractedData = validationResult.data;

    // 7. Match Gemini results back to tradelines
    for (const extracted of extractedData) {
      // Find the best match from our targets array
      const targetMatches = targets.filter(
        (t) =>
          t.name.toLowerCase() === extracted.creditorName.toLowerCase() ||
          (extracted.accountNumber &&
            t.accountNumber !== "Unknown" &&
            t.accountNumber === extracted.accountNumber)
      );

      // If we have a match, process updates
      if (targetMatches.length > 0) {
        const target = targetMatches[0]; // Take the first best match
        const dbTradeline = tradelines.find((tl) => tl.id === target.id);

        if (!dbTradeline) continue;

        const updatesToApply: Record<string, any> = {};

        // 8. Update only the null fields
        for (const [fieldName, value] of Object.entries(extracted.fields)) {
          if (!value) continue;

          // Type check to ensure we only update allowed fields
          if (!FIELDS_TO_CHECK.includes(fieldName as TradelineField)) {
            continue;
          }

          const typedField = fieldName as TradelineField;

          // Double check it's actually null/empty in DB before updating
          const isCurrentlyEmpty =
            dbTradeline[typedField] === null ||
            dbTradeline[typedField] === undefined ||
            (typedField === "accountNumber" &&
              (dbTradeline.accountNumber === "Unknown" ||
                dbTradeline.accountNumber === ""));

          if (isCurrentlyEmpty) {
            if (typedField === "accountNumber") {
              updatesToApply[typedField] = value;
            } else {
              // It's a date field, attempt to parse to Date object
              const dateObj = new Date(value);
              if (!isNaN(dateObj.getTime())) {
                updatesToApply[typedField] = dateObj;
              }
            }
          }
        }

        // Apply updates if there are any
        if (Object.keys(updatesToApply).length > 0) {
          try {
            await db
              .updateTable("tradeline")
              .set(updatesToApply)
              .where("id", "=", target.id)
              .execute();

            updated++;
            console.log(
              `[Gap Fill] Updated tradeline ${target.id} with ${Object.keys(updatesToApply).join(", ")}`
            );
          } catch (updateError) {
            const msg = updateError instanceof Error ? updateError.message : "Unknown db update error";
            errors.push(`Failed to update tradeline ${target.id}: ${msg}`);
          }
        }
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error in gap fill";
    console.error("[Gap Fill] Error:", errMsg);
    errors.push(errMsg);
  }

  return { updated, errors };
}