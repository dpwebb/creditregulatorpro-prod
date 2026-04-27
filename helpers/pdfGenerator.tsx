import PdfPrinter from "pdfmake";
import type { TDocumentDefinitions, TFontDictionary, Content } from "pdfmake/interfaces";
import { generatePdfWatermark } from "./contentMarker";

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

async function ensureRobotoFonts(): Promise<TFontDictionary> {
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
 * Structured content for formal legal letters (e.g., credit dispute letters).
 */
export interface LetterContent {
  // Header - Consumer information
  consumerName: string;
  consumerAddress: string[];
  consumerDOB?: string;
  consumerPhone?: string;
  consumerEmail?: string;
  letterDate: string;
  
  // Recipient information
  recipientName: string;
  recipientAddress: string[];
  
  // Subject line
  subject: string;
  
  // Body sections
  introduction: string;
  accountIdentification?: string;
  disputedItems?: string;
  statutoryGrounds: string;
  supportingDocumentation?: string;
  requestedAction: string;
  statutoryTimeframe?: string;
  consumerStatementRight?: string;
  deliveryConfirmation?: string;
  certification: string;
  closing: string;
  signatureImage?: string;
  signatureSvg?: string;
  
  // Footer
  statutoryReference?: string;
  sourceUrl?: string;
  
  // Tracking and delivery
  trackingPlaceholder?: string;
  deliveryInstructions?: string;
}

/**
 * Generates a PDF document from the provided content.
 * Returns a base64 encoded string of the PDF.
 *
 * @param content Either plain text string or structured LetterContent object.
 * @returns Promise resolving to the base64 string of the generated PDF.
 */
export async function generatePDF(
  content: string | LetterContent,
  userId?: string,
  packetId?: string
): Promise<string> {
  let docDefinition: TDocumentDefinitions;

  if (typeof content === "string") {
    // Backward compatibility: plain text
    docDefinition = {
      content: [
        {
          text: content,
          fontSize: 11,
          lineHeight: 1.4,
          alignment: "left",
        },
      ],
      pageSize: "LETTER",
      pageMargins: [72, 72, 72, 72],
      defaultStyle: {
        font: "Roboto",
      },
      styles: {
        header: {
          fontSize: 18,
          bold: true,
          margin: [0, 0, 0, 10],
        },
      },
    };
  } else {
    // Structured legal letter format
    const documentContent: Content[] = [];
    
    let watermarkConfig: ReturnType<typeof generatePdfWatermark> | null = null;
    if (userId && packetId) {
      watermarkConfig = generatePdfWatermark(userId, packetId);
    }

    // Consumer address block (top left) and date (top right) in columns
    documentContent.push({
      columns: [
        {
          width: "*",
          stack: [
            { text: content.consumerName, style: "consumerInfo" },
            ...content.consumerAddress.map(line => ({ text: line, style: "consumerInfo" })),
            ...(content.consumerDOB ? [{ text: `DOB: ${content.consumerDOB}`, style: "consumerInfo" }] : []),
            ...(content.consumerPhone ? [{ text: `Phone: ${content.consumerPhone}`, style: "consumerInfo" }] : []),
            ...(content.consumerEmail ? [{ text: `Email: ${content.consumerEmail}`, style: "consumerInfo" }] : []),
          ],
        },
        {
          width: "auto",
          text: content.letterDate,
          style: "date",
        },
      ],
      margin: [0, 0, 0, 24],
    });

    // Recipient address block
    documentContent.push({
      stack: [
        { text: content.recipientName, style: "recipientInfo" },
        ...content.recipientAddress.map(line => ({ text: line, style: "recipientInfo" })),
      ],
      margin: [0, 0, 0, 24],
    });

    // Subject line
    documentContent.push({
      text: content.subject,
      style: "subject",
      margin: [0, 0, 0, 16],
    });

    // Introduction
    documentContent.push({
      text: content.introduction,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Account Identification
    if (content.accountIdentification) {
      documentContent.push({
        text: "Account Identification",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: content.accountIdentification,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Disputed Items
    if (content.disputedItems) {
      documentContent.push({
        text: "Disputed Items",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: content.disputedItems,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Statutory Grounds
    documentContent.push({
      text: content.statutoryGrounds,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Supporting Documentation
    if (content.supportingDocumentation) {
      documentContent.push({
        text: "Supporting Documentation",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: content.supportingDocumentation,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Requested Action
    documentContent.push({
      text: content.requestedAction,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Statutory Timeframe
    if (content.statutoryTimeframe) {
      documentContent.push({
        text: content.statutoryTimeframe,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Consumer Statement Right
    if (content.consumerStatementRight) {
      documentContent.push({
        text: "Consumer Statement Right",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: content.consumerStatementRight,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Delivery Confirmation
    if (content.deliveryConfirmation) {
      documentContent.push({
        text: "Delivery Confirmation",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: content.deliveryConfirmation,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Certification
    documentContent.push({
      text: content.certification,
      style: "bodyText",
      margin: [0, 0, 0, 16],
    });

    // Closing and signature block
    documentContent.push({
      text: content.closing,
      style: "bodyText",
      margin: [0, 0, 0, 8],
    });

    // Signature image, SVG, or blank lines for handwritten signature
    if (content.signatureSvg) {
      documentContent.push({
        svg: content.signatureSvg,
        width: 150,
        margin: [0, 8, 0, 8],
      });
    } else if (content.signatureImage) {
      documentContent.push({
        image: content.signatureImage,
        width: 150,
        height: 50,
        margin: [0, 8, 0, 8],
      });
    } else {
      documentContent.push({
        text: "\n\n\n",
        margin: [0, 0, 0, 0],
      });
    }

    // Typed name
    documentContent.push({
      text: content.consumerName,
      style: "bodyText",
      margin: [0, 0, 0, 24],
    });

    // Tracking and Delivery Information (if provided)
    if (content.trackingPlaceholder || content.deliveryInstructions) {
      documentContent.push({
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 468, // Page width minus margins (612 - 72*2 = 468)
            h: content.trackingPlaceholder && content.deliveryInstructions ? 80 : 40,
            color: "#f5f5f5",
          },
        ],
        margin: [0, 0, 0, 0],
      });

            documentContent.push({
        stack: [
          ...(content.trackingPlaceholder ? [
            {
              text: "Delivery Tracking",
              style: "trackingHeading",
              margin: [8, 8, 8, 4] as [number, number, number, number],
            },
            {
              text: `Temporary Tracking ID: ${content.trackingPlaceholder}`,
              style: "trackingPlaceholder",
              margin: [8, 0, 8, 8] as [number, number, number, number],
            },
          ] : []),
          ...(content.deliveryInstructions ? [
            {
              text: content.deliveryInstructions,
              style: "deliveryInstructions",
              margin: [8, 0, 8, 8] as [number, number, number, number],
            },
          ] : []),
        ],
        margin: [0, -80, 0, 24] as [number, number, number, number],
      });
    }

    // Credit Regulator Pro Platform Disclaimer
    documentContent.push({
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 468, // Page width minus margins (612 - 72*2 = 468)
          y2: 0,
          lineWidth: 1,
          lineColor: "#cccccc",
        },
      ],
      margin: [0, 24, 0, 8],
    });

    documentContent.push({
      text: "This communication was prepared and transmitted via Credit Regulator Pro at the consumer's direction. Credit Regulator Pro is a software facilitation platform and does not represent the consumer.",
      style: "crpDisclaimer",
      margin: [0, 0, 0, 16],
    });

    // Footer with statutory reference
    if (content.statutoryReference || content.sourceUrl) {
      documentContent.push({
        stack: [
          ...(content.statutoryReference ? [{
            text: content.statutoryReference,
            style: "footer",
          }] : []),
          ...(content.sourceUrl ? [{
            text: content.sourceUrl,
            style: "footer",
          }] : []),
        ],
        margin: [0, 16, 0, 0],
      });
    }

    docDefinition = {
      content: documentContent,
      pageSize: "LETTER",
      pageMargins: [72, 72, 72, 72],
      ...(watermarkConfig?.watermark ? { watermark: watermarkConfig.watermark as any } : {}),
      ...(watermarkConfig?.info ? { info: watermarkConfig.info } : {}),
      defaultStyle: {
        font: "Roboto",
        fontSize: 11,
        lineHeight: 1.4,
      },
      styles: {
        consumerInfo: {
          fontSize: 11,
          lineHeight: 1.2,
        },
        date: {
          fontSize: 11,
          alignment: "right",
        },
        recipientInfo: {
          fontSize: 11,
          lineHeight: 1.2,
        },
        subject: {
          fontSize: 11,
          bold: true,
        },
        sectionHeading: {
          fontSize: 11,
          bold: true,
        },
        bodyText: {
          fontSize: 11,
          lineHeight: 1.4,
          alignment: "left",
        },
        trackingHeading: {
          fontSize: 10,
          bold: true,
          color: "#333333",
        },
        trackingPlaceholder: {
          fontSize: 10,
          bold: true,
          color: "#000000",
        },
        deliveryInstructions: {
          fontSize: 9,
          color: "#555555",
          lineHeight: 1.3,
        },
        footer: {
          fontSize: 9,
          color: "#666666",
          lineHeight: 1.2,
        },
        crpDisclaimer: {
          fontSize: 8,
          italics: true,
          color: "#888888",
          lineHeight: 1.2,
        },
      },
      // Page numbers for multi-page letters and optional watermark footer
      footer: (currentPage: number, pageCount: number): Content => {
        const stack: Content[] = [];
        
        if (pageCount > 1) {
          stack.push({
            text: `Page ${currentPage} of ${pageCount}`,
            alignment: "center",
            fontSize: 9,
            color: "#666666",
            margin: [0, 20, 0, 0],
          });
        }
        
        if (watermarkConfig?.footer) {
          stack.push(watermarkConfig.footer(currentPage, pageCount) as Content);
        }

        return stack.length > 0 ? { stack } : { text: "" };
      },
    };
  }

  // Ensure fonts are available before creating the printer
  const fonts = await ensureRobotoFonts();

  // Create printer instance with font configuration
  const printer = new PdfPrinter(fonts);

  // Generate PDF document
  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  // Convert PDF stream to base64
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    pdfDoc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      const base64String = pdfBuffer.toString("base64");
      resolve(base64String);
    });

    pdfDoc.on("error", (error: Error) => {
      console.error("PDF generation error:", error);
      reject(error);
    });

    // Finalize the PDF document
    pdfDoc.end();
  });
}