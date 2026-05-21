import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

const ROBOTO_FONTS = {
  normal: {
    localPath: "fonts/Roboto-Regular.ttf",
    url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf",
    filename: "Roboto-Regular.ttf",
  },
  bold: {
    localPath: "fonts/Roboto-Medium.ttf",
    url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf",
    filename: "Roboto-Medium.ttf",
  },
  italics: {
    localPath: "fonts/Roboto-Italic.ttf",
    url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Italic.ttf",
    filename: "Roboto-Italic.ttf",
  },
  bolditalics: {
    localPath: "fonts/Roboto-MediumItalic.ttf",
    url: "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-MediumItalic.ttf",
    filename: "Roboto-MediumItalic.ttf",
  },
};

type RobotoFontStyle = keyof typeof ROBOTO_FONTS;

const STANDARD_FONT_FALLBACK: Record<RobotoFontStyle, string> = {
  normal: "Helvetica",
  bold: "Helvetica-Bold",
  italics: "Helvetica-Oblique",
  bolditalics: "Helvetica-BoldOblique",
};

const FONT_FETCH_TIMEOUT_MS = 8000;
const FONT_FETCH_MAX_ATTEMPTS = 2;
const REMOTE_FONT_FETCH_ENV = "CRP_PDF_REMOTE_FONT_FETCH";

let remoteFontFallbackWarned = false;

function isRemoteFontFetchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env[REMOTE_FONT_FETCH_ENV] ?? "").trim().toLowerCase() === "true";
}

function fallbackFontDictionary(): TFontDictionary {
  return {
    Roboto: {
      normal: STANDARD_FONT_FALLBACK.normal,
      bold: STANDARD_FONT_FALLBACK.bold,
      italics: STANDARD_FONT_FALLBACK.italics,
      bolditalics: STANDARD_FONT_FALLBACK.bolditalics,
    },
  };
}

const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const downloadFontBuffer = async (url: string, filename: string): Promise<Buffer> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FONT_FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, FONT_FETCH_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      lastError = error;
      if (attempt === FONT_FETCH_MAX_ATTEMPTS) {
        break;
      }
    }
  }

  const errorDetail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch font ${filename}: ${errorDetail}`);
};

/**
 * Ensures Roboto fonts are present locally or downloads them into the temp directory.
 * Required for serverless pdfmake generation.
 */
export async function ensureRobotoFonts(): Promise<TFontDictionary> {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const fontsDir = path.join(os.tmpdir(), "pdfmake-fonts");

  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  const result: Record<RobotoFontStyle, string> = {
    normal: "",
    bold: "",
    italics: "",
    bolditalics: "",
  };

  const failedStyles: RobotoFontStyle[] = [];
  const fontStyles = Object.keys(ROBOTO_FONTS) as RobotoFontStyle[];

  for (const style of fontStyles) {
    const config = ROBOTO_FONTS[style];

    if (fs.existsSync(config.localPath)) {
      result[style] = config.localPath;
      continue;
    }

    const tmpPath = path.join(fontsDir, config.filename);
    if (fs.existsSync(tmpPath)) {
      result[style] = tmpPath;
      continue;
    }

    if (!isRemoteFontFetchEnabled()) {
      failedStyles.push(style);
      continue;
    }

    try {
      const fontBuffer = await downloadFontBuffer(config.url, config.filename);
      fs.writeFileSync(tmpPath, fontBuffer);
      result[style] = tmpPath;
    } catch (error) {
      failedStyles.push(style);
      const errorDetail = error instanceof Error ? error.message : String(error);
      console.warn(`[pdfServerUtils] ${errorDetail}. Falling back for style "${style}".`);
    }
  }

  if (failedStyles.length > 0) {
    if (!remoteFontFallbackWarned) {
      const reason = isRemoteFontFetchEnabled()
        ? `Unable to load Roboto styles: ${failedStyles.join(", ")}`
        : `${REMOTE_FONT_FETCH_ENV}=true is not set and packaged Roboto fonts are unavailable`;
      console.warn(`[pdfServerUtils] ${reason}. Falling back to standard PDF fonts.`);
      remoteFontFallbackWarned = true;
    }
    for (const style of failedStyles) {
      result[style] = STANDARD_FONT_FALLBACK[style];
    }
  }

  return Object.values(result).some((value) => value.length === 0)
    ? fallbackFontDictionary()
    : {
        Roboto: {
          normal: result.normal,
          bold: result.bold,
          italics: result.italics,
          bolditalics: result.bolditalics,
        },
      };
}

/**
 * Generates a base64 encoded PDF string given a document definition, using the server-side PdfPrinter.
 */
export async function generateServerPdf(docDefinition: TDocumentDefinitions): Promise<string> {
  const fonts = await ensureRobotoFonts();
  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    pdfDoc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      resolve(pdfBuffer.toString("base64"));
    });

    pdfDoc.on("error", (error: Error) => {
      console.error("PDF generation error:", error);
      reject(error);
    });

    pdfDoc.end();
  });
}
