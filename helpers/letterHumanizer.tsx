import type { LetterContent } from "./pdfGenerator";
import { lintLetterContentForRegulatorSafety } from "./letterSafetyLinter";

const NARRATIVE_KEYS = [
  "introduction",
  "disputedItems",
  "statutoryGrounds",
  "supportingDocumentation",
  "requestedAction",
  "statutoryTimeframe",
  "consumerStatementRight",
  "deliveryConfirmation",
  "certification",
] as const;

type NarrativeKey = typeof NARRATIVE_KEYS[number];

function compactWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(text: string): Set<string> {
  return new Set(
    normalizeForComparison(text)
      .split(" ")
      .filter((word) => word.length > 3)
  );
}

function similarity(a: string, b: string): number {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 || right.size === 0) return 0;

  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap++;
  }

  return overlap / Math.min(left.size, right.size);
}

function splitParagraphs(text: string): string[] {
  return compactWhitespace(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function removeRepeatedSentences(text: string): string {
  if (/\n\s*\d+\./.test(text) || /\b[A-Z]\.(?:[A-Z]\.)+/.test(text)) {
    return text;
  }

  const seen = new Set<string>();
  const sentences = text.match(/[^.!?]+[.!?]*/g);
  if (!sentences) return text;

  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!sentence) return false;
      const normalized = normalizeForComparison(sentence);
      if (!normalized) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(" ");
}

function stripEmbeddedSectionLabels(text: string, key: NarrativeKey): string {
  let output = text.trim();

  if (key === "disputedItems") {
    output = output.replace(/^(Basis of Dispute|Disputed Items|Items Disputed):\s*/i, "");
  }

  return output;
}

function humanizeTemplateLanguage(text: string): string {
  return text
    .replace(
      /I am writing to formally dispute information contained in my consumer report maintained by your agency\./g,
      "I'm writing because I found information in my credit report that I believe is inaccurate or incomplete."
    )
    .replace(
      /I am writing to formally dispute personal information contained in my consumer report maintained by your organization\./g,
      "I'm writing because I found personal information in my credit report that I believe is inaccurate or incomplete."
    )
    .replace(
      /This dispute is submitted pursuant to (.*?), and I request that you conduct a reasonable investigation as required by statute\./g,
      "I am relying on $1 and ask that you investigate this carefully."
    )
    .replace(
      /This dispute is submitted pursuant to (.*?), and I request correction of inaccurate information as provided by statute\./g,
      "I am relying on $1 and ask that you correct the inaccurate information."
    )
    .replace(
      /I assert that the disputed items do not meet this statutory standard and request immediate investigation\./g,
      "I believe the disputed information does not meet that standard, and I am asking for a prompt investigation."
    )
    .replace(
      /I assert that the disputed items are inaccurate and request immediate correction or deletion\./g,
      "I believe the disputed information is inaccurate, and I am asking that it be corrected or deleted."
    )
    .replace(/I request that you:/g, "Please:")
    .replace(
      /I certify under penalty of law that the information provided in this letter is true and accurate to the best of my knowledge\./g,
      "I confirm that the information in this letter is true and accurate to the best of my knowledge."
    )
    .replace(
      /I certify that the information provided in this letter is true and accurate to the best of my knowledge\./g,
      "I confirm that the information in this letter is true and accurate to the best of my knowledge."
    )
    .replace(
      /Should the investigation not resolve this matter to my satisfaction, I reserve my right under .*? to have a consumer statement included in my file\./g,
      "If this is not resolved, I reserve my right to add a consumer statement to my file."
    );
}

function cleanNarrativeSection(
  text: string,
  key: NarrativeKey,
  seenParagraphs: string[]
): string {
  const paragraphs = splitParagraphs(stripEmbeddedSectionLabels(text, key));
  const kept: string[] = [];

  for (const paragraph of paragraphs) {
    const cleaned = removeRepeatedSentences(humanizeTemplateLanguage(paragraph));
    const normalized = normalizeForComparison(cleaned);
    if (!normalized) continue;

    const isDuplicate = seenParagraphs.some((seen) => {
      if (seen === normalized) return true;
      return similarity(seen, normalized) > 0.9;
    });

    if (!isDuplicate) {
      kept.push(cleaned);
      seenParagraphs.push(normalized);
    }
  }

  return kept.join("\n\n") || compactWhitespace(text);
}

export function streamlineLetterContent(letterContent: LetterContent): LetterContent {
  const streamlined: LetterContent = { ...letterContent };
  const seenParagraphs: string[] = [];

  for (const key of NARRATIVE_KEYS) {
    const value = streamlined[key];
    if (typeof value === "string" && value.trim()) {
      (streamlined as unknown as Record<string, unknown>)[key] = cleanNarrativeSection(value, key, seenParagraphs);
    }
  }

  return streamlined;
}

/**
 * A backend-only helper that uses OpenAI to rewrite the narrative sections 
 * of a credit dispute letter so it sounds like a real person wrote it.
 *
 * @param letterContent The structured letter content generated by templates.
 * @returns A promise resolving to the humanized LetterContent, or the original on failure.
 */
export async function letterHumanizer(
  letterContent: LetterContent
): Promise<LetterContent> {
  const locallyStreamlined = streamlineLetterContent(letterContent);
  const locallySafe = lintLetterContentForRegulatorSafety(locallyStreamlined);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return locallySafe;
    }

    // 1. Extract the narrative sections that need humanizing
    const sectionsToHumanize: Record<string, string> = {};

    if (locallySafe.introduction) sectionsToHumanize.introduction = locallySafe.introduction;
    if (locallySafe.disputedItems) sectionsToHumanize.disputedItems = locallySafe.disputedItems;
    if (locallySafe.statutoryGrounds) sectionsToHumanize.statutoryGrounds = locallySafe.statutoryGrounds;
    if (locallySafe.requestedAction) sectionsToHumanize.requestedAction = locallySafe.requestedAction;
    if (locallySafe.statutoryTimeframe) sectionsToHumanize.statutoryTimeframe = locallySafe.statutoryTimeframe;
    if (locallySafe.certification) sectionsToHumanize.certification = locallySafe.certification;

    // If there's nothing to humanize, just return the original
    if (Object.keys(sectionsToHumanize).length === 0) {
      return locallySafe;
    }

    // 2. Define the system prompt
    const systemPrompt = `You are a helpful assistant that rewrites credit dispute letters to sound like a real Canadian consumer wrote them by hand, rather than a template engine.

Rules:
1. Rewrite the text as if a real Canadian consumer wrote it by hand.
2. Vary sentence length, structure, and vocabulary naturally.
3. Use first-person voice (e.g., "I noticed...", "When I checked my report...").
4. Keep ALL factual data exactly intact (dates, dollar amounts, account numbers, statute names/sections, bureau names).
5. Reference legislation naturally within sentences instead of using formal "Statutory Basis:" labels.
6. Keep a firm but polite tone — the consumer is asserting their rights, not being aggressive.
7. Avoid overly formal legalese — a normal person wouldn't write "I am formally disputing the accuracy and completeness of personal information".
8. Do NOT add any new facts, claims, or context not present in the original text.
9. If any value looks like an internal system code, character count, technical metric, or database ID rather than actual account data (e.g. '28 chars', 'Max 24 chars', 'Non-zero rating'), rephrase it naturally using the surrounding context or omit it entirely.
10. Remove duplicated sentences or paragraphs if the same point appears in more than one section.
11. Output a JSON object containing the EXACT SAME keys as the input object, with the rewritten text as the values.`;

    // 3. Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(sectionsToHumanize) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API returned status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 4. Parse the AI response and merge it back
    const rewrittenTextRaw = data.choices?.[0]?.message?.content;
    if (!rewrittenTextRaw) {
      throw new Error("No content returned from OpenAI");
    }

    const rewrittenSections = JSON.parse(rewrittenTextRaw) as Record<string, string>;

    const mergedContent = {
      ...locallySafe,
      introduction: rewrittenSections.introduction ?? locallySafe.introduction,
      disputedItems: rewrittenSections.disputedItems ?? locallySafe.disputedItems,
      statutoryGrounds: rewrittenSections.statutoryGrounds ?? locallySafe.statutoryGrounds,
      requestedAction: rewrittenSections.requestedAction ?? locallySafe.requestedAction,
      statutoryTimeframe: rewrittenSections.statutoryTimeframe ?? locallySafe.statutoryTimeframe,
      certification: rewrittenSections.certification ?? locallySafe.certification,
    };

    return lintLetterContentForRegulatorSafety(streamlineLetterContent(mergedContent));
  } catch (error) {
    // 5. Fallback on any error
    console.error("Failed to humanize letter content. Falling back to original template.", error instanceof Error ? error.message : error);
    return locallySafe;
  }
}
