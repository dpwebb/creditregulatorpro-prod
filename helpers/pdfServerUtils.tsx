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

  const result: TFontDictionary = {
    Roboto: {
      normal: "",
      bold: "",
      italics: "",
      bolditalics: "",
    },
  };

  for (const [style, config] of Object.entries(ROBOTO_FONTS)) {
    if (fs.existsSync(config.localPath)) {
      (result.Roboto as any)[style] = config.localPath;
      continue;
    }

    const tmpPath = path.join(fontsDir, config.filename);
    if (!fs.existsSync(tmpPath)) {
      const response = await fetch(config.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch font ${config.filename}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));
    }

    (result.Roboto as any)[style] = tmpPath;
  }

  return result;
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