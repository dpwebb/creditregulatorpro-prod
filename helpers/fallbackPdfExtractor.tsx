/**
 * Helper to extract HTML from credit report PDFs using LLM vision capabilities.
 * Designed as a fallback when DocStrange extraction fails.
 */

const EXTRACTION_PROMPT = `Detect whether the provided PDF is a TransUnion or Equifax Canadian credit report and extract ALL its data into a raw HTML format that matches our internal parsers exactly. Output ONLY raw HTML, no markdown fences, and no explanation text. Extract ALL pages completely without truncation.

Do not infer, summarize, repair, or invent missing account values. If a field is not visible in the PDF, leave that field blank. Preserve the bureau's visible wording for source text and account sections so downstream review can compare parser output against the original report.

If it's a TransUnion report, the HTML MUST follow this structure:
- Report date: "as of Month Day, Year" inside a <p> or text block
- TU Case ID: "TU Case ID: XXXXX"
- First reported/last reviewed: "first reported to TransUnion on <strong>Date</strong> and was last reviewed by [*CONSUMER DISCLOSURE *] on <strong>Date</strong>"
- Section headers must be plain text followed by a colon: "Personal Information :", "Cross Reference(s) :", "Address(es) :", "Employment(s) :", "Telephone Number(s) :", "Account(s) :", "Credit Related Inquiries :", "Non-Credit Related Inquiries :", "Account Review Inquiries :", "Insolvency :"
- Each section uses HTML tables with header rows:
  - Personal Info: Surname, Given Name, Middle Name, Suffix, Social Insurance, Birth Date
  - Addresses: Address, City, Prov, Postal, Type, Own/Rent, Since
  - Employments: Date, Employer, Occupation, Start Date, Finish Date, Pay, Pay Frequency
  - Telephones: Qualifier, Number, Ext, Type, Date
  - Each Account block must start with a table row containing "Creditor Name" label and its value. Account fields must be in key-value table pairs: Account Number, Account Type, Status, Balance, High Credit, Past Due, Credit Limit, Opened Date, Reported Date, Closed Date, Posted Date, Charge Off, Balloon Payment, Monthly Payment, Terms, Months Reviewed, Responsibility Code, Legend, Payment History, Last Payment, Date of First Delinquency.
  - For fields not explicitly labeled, use these source mapping instructions:
    - Status: derive from the Legend line (e.g., "AC-Account closed/rating non derogatory" -> Status = "AC")
    - Balance: use the Balance value from the MOST RECENT (first) row of the payment history detail table
    - High Credit: use the High Credit value from the most recent row of the detail table
    - Past Due: use the Past Due value from the most recent row of the detail table
    - Credit Limit: use the Credit Limit value from the most recent row of the detail table
    - Monthly Payment: derive from the Terms field (e.g., "522/M" means $522 monthly payment)
    - Months Reviewed: use the #M value from the Payment History summary (e.g., 30=0, 60=0, 90=0, #M=71 -> Months Reviewed = 71)
    - Responsibility Code: extract from the second part of Account Type after the "/" (e.g., "INSTALLMENT / INDIVIDUAL" -> Responsibility Code = "Individual")
  - Payment history detail table with columns: Date, Balance, Payment, Past Due, MOP, Terms, High Credit, Credit Limit, Balloon Payment, Charge Off, Narrative
  - Late payment summary table with columns: 30, 60, 90, #M
  - Inquiries table: Date, Authorized User, Telephone
  - Insolvency table: Type, Date Filed, Status, Amount, Discharge, Court, Trustee, Liability, Asset

If it's an Equifax report, the HTML MUST follow this structure:
- H1 section headers: <h1>Personal Information</h1>, <h1>Credit Score</h1>, <h1>Accounts - Revolving</h1>, <h1>Accounts - Installment</h1>, <h1>Accounts - Open</h1>, <h1>Accounts - Mortgage</h1>, <h1>Collections</h1>, <h1>Inquiries</h1>
- Request Date: "Request Date YYYY/MM/DD"
- Personal info: tables with "Current Name", "Date of Birth", "Social Insurance Number" as key cells, address rows with columns: Type (Current/Previous), date, Address, City, Province, Postal Code. Employer rows. Phone rows with Home/type and number.
- Credit Score section: "Equifax Credit Score<br />NNN" and "as of YYYY/MM/DD"
- Account sections: H2 headers <h2>Creditor Name</h2> for each account. Overview table with headers: Account Number, (other), High Credit, (other), (other), Rating Code. Balance table with cells containing text like "Balance $X", "Credit Limit $X", "Past Due $X", "Opened YYYY/MM/DD", "Reported YYYY/MM/DD", "Last Payment YYYY/MM/DD", "Closed YYYY/MM/DD". Payment history table: Month, Balance, Credit Limit, High Credit, Past Due, Payment. Months Reviewed table.
- Collections section: H2 for each agency name. Key-value table rows: Date Assigned, Account Number, Amount, Balance, Last Payment Date, First Delinquency, Member Name, Member Number, Rating Code/Status.
- Inquiries table: Date, Member Name, Phone, May Affect Scores`;

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

/**
 * Ensures the base64 string does not have the data URI prefix.
 */
function cleanBase64Data(base64Data: string): string {
  return base64Data.replace(/^data:application\/pdf;base64,/, "");
}

/**
 * Safely removes markdown code fences (e.g., ```html ... ```) from the LLM output.
 */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  const fenceRegex = /^```(?:html)?\s*([\s\S]*?)```$/i;
  const match = cleaned.match(fenceRegex);
  if (match) {
    return match[1].trim();
  }
  return cleaned;
}

/**
 * Sends PDF to OpenAI Responses API using native file format.
 * Tries OPENAI_FALLBACK_MODEL first (if set), then compatible defaults.
 */
export async function extractHtmlWithOpenAI(base64Pdf: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Fallback-OpenAI] Missing OPENAI_API_KEY environment variable.");
    return null;
  }

  try {
    const cleanBase64 = cleanBase64Data(base64Pdf);
    const pdfDataUri = `data:application/pdf;base64,${cleanBase64}`;
    const configuredModel = process.env.OPENAI_FALLBACK_MODEL?.trim();
    const candidateModels = Array.from(
      new Set(
        [configuredModel, "gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini"].filter(
          (value): value is string => Boolean(value)
        )
      )
    );

    console.log(`[Fallback-OpenAI] Sending PDF to OpenAI with ${candidateModels.length} model candidate(s)...`);

    for (const model of candidateModels) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: EXTRACTION_PROMPT,
                },
                {
                  type: "input_file",
                  filename: "credit-report.pdf",
                  file_data: pdfDataUri,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Fallback-OpenAI] API Error (${model}): ${response.status} ${response.statusText}`,
          errorText
        );
        continue;
      }

      const data = (await response.json()) as OpenAiResponse;
      const content =
        data.output_text ||
        data.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;

      if (!content) {
        console.error(`[Fallback-OpenAI] Received empty content from model ${model}.`);
        continue;
      }

      console.log(`[Fallback-OpenAI] Successfully extracted HTML with ${model}.`);
      return stripMarkdownFences(content);
    }

    console.error("[Fallback-OpenAI] All model candidates failed.");
    return null;
  } catch (error) {
    console.error("[Fallback-OpenAI] Unexpected error during extraction:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Sends PDF to Gemini gemini-2.5-flash using inlineData.
 */
export async function extractHtmlWithGemini(base64Pdf: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY?.trim() || process.env.GOOGLE_GEMINI_SA_KEY?.trim();
  if (!apiKey) {
    console.error("[Fallback-Gemini] Missing GOOGLE_GEMINI_API_KEY / GOOGLE_GEMINI_SA_KEY environment variable.");
    return null;
  }

  if (apiKey.startsWith("{") || apiKey.includes("\"type\": \"service_account\"")) {
    console.error(
      "[Fallback-Gemini] Gemini key appears to be a service account JSON payload. Use a plain API key string."
    );
    return null;
  }

  try {
    const cleanBase64 = cleanBase64Data(base64Pdf);

    console.log("[Fallback-Gemini] Sending PDF to Gemini gemini-2.5-flash...");

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Fallback-Gemini] API Error: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const data = (await response.json()) as GeminiResponse;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error("[Fallback-Gemini] Received empty content from Gemini.");
      return null;
    }

    console.log("[Fallback-Gemini] Successfully extracted HTML.");
    return stripMarkdownFences(content);
  } catch (error) {
    console.error("[Fallback-Gemini] Unexpected error during extraction:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Fallback chain that attempts OpenAI first, and then Gemini if OpenAI fails.
 */
export async function extractHtmlWithFallbackChain(
  base64Pdf: string
): Promise<{ html: string; source: "openai" | "gemini" } | null> {
  console.log("[Fallback Chain] Starting primary AI extraction process (Gemini)...");

  const geminiHtml = await extractHtmlWithGemini(base64Pdf);
  if (geminiHtml) {
    return { html: geminiHtml, source: "gemini" };
  }

  console.log("[Fallback Chain] Gemini failed. Proceeding to OpenAI fallback...");

  const openAiHtml = await extractHtmlWithOpenAI(base64Pdf);
  if (openAiHtml) {
    return { html: openAiHtml, source: "openai" };
  }

  console.error("[Fallback Chain] All extraction methods failed.");
  return null;
}
