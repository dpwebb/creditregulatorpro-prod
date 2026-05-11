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
 * Historical consumer-file reference data stored inside existing packet content.
 * New dispute packet creation is reset; keep this local type only so old packets
 * can still be rendered without importing the retired dispute-letter engine.
 */
export type ConsumerFileReference = {
  previousNames?: string[];
  previousAddresses?: string[];
  sinLastDigits?: string;
  creditReportReferenceNumber?: string;
  reportDate?: string;
};

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
  consumerFileReference?: ConsumerFileReference;
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
  applicationToAccount?: string;
  supportingDocumentation?: string;
  consumerIdentificationImage?: string;
  consumerIdentificationFileName?: string;
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

  // Runtime values used to render admin-managed letter template placeholders.
  templateVariables?: Record<string, string | number | null | undefined>;
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
    const safeContent = content;

    // Structured legal letter format
    const documentContent: Content[] = [];
    
    let watermarkConfig: ReturnType<typeof generatePdfWatermark> | null = null;
    if (userId && packetId) {
      watermarkConfig = generatePdfWatermark(userId, packetId);
    }

    // Date and consumer identification block.
    documentContent.push({
      text: safeContent.letterDate,
      style: "date",
      margin: [0, 0, 0, 16],
    });

    documentContent.push({
      stack: [
        { text: "Consumer Identification", style: "sectionHeading", margin: [0, 0, 0, 4] },
        { text: safeContent.consumerName, style: "consumerInfo" },
        ...safeContent.consumerAddress.map(line => ({ text: line, style: "consumerInfo" })),
        ...(safeContent.consumerDOB ? [{ text: `DOB: ${safeContent.consumerDOB}`, style: "consumerInfo" }] : []),
        ...(safeContent.consumerPhone ? [{ text: `Phone: ${safeContent.consumerPhone}`, style: "consumerInfo" }] : []),
        ...(safeContent.consumerEmail ? [{ text: `Email: ${safeContent.consumerEmail}`, style: "consumerInfo" }] : []),
        ...(safeContent.consumerFileReference?.previousNames?.length
          ? [{ text: `Previous names/aliases: ${safeContent.consumerFileReference.previousNames.join("; ")}`, style: "consumerInfo" }]
          : []),
        ...(safeContent.consumerFileReference?.previousAddresses?.length
          ? [{ text: `Previous addresses: ${safeContent.consumerFileReference.previousAddresses.join("; ")}`, style: "consumerInfo" }]
          : []),
        ...(safeContent.consumerFileReference?.sinLastDigits
          ? [{ text: `SIN last four digits: ${safeContent.consumerFileReference.sinLastDigits}`, style: "consumerInfo" }]
          : []),
        ...(safeContent.consumerFileReference?.creditReportReferenceNumber
          ? [{ text: `Credit report/file reference: ${safeContent.consumerFileReference.creditReportReferenceNumber}`, style: "consumerInfo" }]
          : []),
        ...(safeContent.consumerFileReference?.reportDate
          ? [{ text: `Report date disputed: ${safeContent.consumerFileReference.reportDate}`, style: "consumerInfo" }]
          : []),
      ],
      margin: [0, 0, 0, 24],
    });

    // Recipient address block
    documentContent.push({
      stack: [
        { text: "Bureau / Recipient Identification", style: "sectionHeading", margin: [0, 0, 0, 4] },
        { text: safeContent.recipientName, style: "recipientInfo" },
        ...safeContent.recipientAddress.map(line => ({ text: line, style: "recipientInfo" })),
      ],
      margin: [0, 0, 0, 24],
    });

    // Subject line
    documentContent.push({
      text: safeContent.subject,
      style: "subject",
      margin: [0, 0, 0, 16],
    });

    // Introduction
    documentContent.push({
      text: safeContent.introduction,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Account Identification
    if (safeContent.accountIdentification) {
      documentContent.push({
        text: "Account Identification",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.accountIdentification,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Particulars
    if (safeContent.disputedItems) {
      documentContent.push({
        text: "Particulars",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.disputedItems,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Statutory Grounds
    documentContent.push({
      text: "Statutory Grounds",
      style: "sectionHeading",
      margin: [0, 0, 0, 8],
    });
    documentContent.push({
      text: safeContent.statutoryGrounds,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Application to this account
    if (safeContent.applicationToAccount) {
      documentContent.push({
        text: "Application to this account",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.applicationToAccount,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Requested Action
    documentContent.push({
      text: "Requested Action",
      style: "sectionHeading",
      margin: [0, 0, 0, 8],
    });
    documentContent.push({
      text: safeContent.requestedAction,
      style: "bodyText",
      margin: [0, 0, 0, 12],
    });

    // Supporting Documentation
    if (safeContent.supportingDocumentation) {
      documentContent.push({
        text: "Supporting evidence and attachments",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.supportingDocumentation,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    if (safeContent.consumerIdentificationImage) {
      documentContent.push({
        text: "Consumer Identification Attachment",
        style: "sectionHeading",
        pageBreak: "before",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.consumerIdentificationFileName
          ? `Identification image on file: ${safeContent.consumerIdentificationFileName}`
          : "Identification image on file",
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
      documentContent.push({
        image: safeContent.consumerIdentificationImage,
        fit: [450, 610],
        alignment: "center",
        margin: [0, 0, 0, 12],
      });
    }

    // Statutory Timeframe
    if (safeContent.statutoryTimeframe) {
      documentContent.push({
        text: safeContent.statutoryTimeframe,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Consumer Statement Right
    if (safeContent.consumerStatementRight) {
      documentContent.push({
        text: "Consumer Statement Right",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.consumerStatementRight,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Delivery Confirmation
    if (safeContent.deliveryConfirmation) {
      documentContent.push({
        text: "Delivery Confirmation",
        style: "sectionHeading",
        margin: [0, 0, 0, 8],
      });
      documentContent.push({
        text: safeContent.deliveryConfirmation,
        style: "bodyText",
        margin: [0, 0, 0, 12],
      });
    }

    // Certification and signature block
    documentContent.push({
      text: "Signature",
      style: "sectionHeading",
      margin: [0, 0, 0, 8],
    });
    documentContent.push({
      text: safeContent.certification,
      style: "bodyText",
      margin: [0, 0, 0, 16],
    });

    // Closing and signature block
    documentContent.push({
      text: safeContent.closing,
      style: "bodyText",
      margin: [0, 0, 0, 8],
    });

    // Signature image, SVG, or blank lines for handwritten signature
    if (safeContent.signatureSvg) {
      documentContent.push({
        svg: safeContent.signatureSvg,
        width: 150,
        margin: [0, 8, 0, 8],
      });
    } else if (safeContent.signatureImage) {
      documentContent.push({
        image: safeContent.signatureImage,
        width: 150,
        height: 50,
        margin: [0, 8, 0, 8],
      });
    }

    // Typed name
    documentContent.push({
      text: safeContent.consumerName,
      style: "bodyText",
      margin: [0, 0, 0, 24],
    });

    // Tracking and Delivery Information (if provided)
    if (safeContent.trackingPlaceholder || safeContent.deliveryInstructions) {
      documentContent.push({
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 468, // Page width minus margins (612 - 72*2 = 468)
            h: safeContent.trackingPlaceholder && safeContent.deliveryInstructions ? 80 : 40,
            color: "#f5f5f5",
          },
        ],
        margin: [0, 0, 0, 0],
      });

            documentContent.push({
        stack: [
          ...(safeContent.trackingPlaceholder ? [
            {
              text: "Delivery Tracking",
              style: "trackingHeading",
              margin: [8, 8, 8, 4] as [number, number, number, number],
            },
            {
              text: `Temporary Tracking ID: ${safeContent.trackingPlaceholder}`,
              style: "trackingPlaceholder",
              margin: [8, 0, 8, 8] as [number, number, number, number],
            },
          ] : []),
          ...(safeContent.deliveryInstructions ? [
            {
              text: safeContent.deliveryInstructions,
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
    if (safeContent.statutoryReference || safeContent.sourceUrl) {
      documentContent.push({
        stack: [
          ...(safeContent.statutoryReference ? [{
            text: safeContent.statutoryReference,
            style: "footer",
          }] : []),
          ...(safeContent.sourceUrl ? [{
            text: safeContent.sourceUrl,
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
          alignment: "left",
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
