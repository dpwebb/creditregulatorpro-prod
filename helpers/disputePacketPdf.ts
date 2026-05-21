import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { generatePdfWatermark } from "./contentMarker";
import { generateServerPdf } from "./pdfServerUtils";
import {
  type SimpleDisputePacketContent,
  type SimpleDisputedItem,
} from "./disputePacketTemplate";
import {
  formatPacketAccountIdentifier,
  formatPacketDisplayDate,
  formatPacketDisplayValue,
  formatPacketFieldLabel,
  redactPacketSensitiveText,
} from "./disputePacketHumanization";

const PDF_ITEM_REQUEST =
  "Please verify this information and correct or remove it if it cannot be supported.";

function bulletList(items: string[]): Content {
  return {
    ul: items.length > 0 ? items : ["Needs manual review"],
    style: "bodyText",
    margin: [0, 0, 0, 12],
  };
}

function safePdfText(value: unknown): string {
  return redactPacketSensitiveText(value)
    .replace(/\bsource\s+report\b/gi, "credit report")
    .replace(/\breport\s+artifact\b/gi, "credit report")
    .replace(/\bartifact\b/gi, "credit report")
    .replace(/\s+/g, " ")
    .trim();
}

function safePdfDate(value: unknown): string {
  return safePdfText(formatPacketDisplayDate(value));
}

function safePdfAccountIdentifier(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /not provided|unavailable/i.test(raw)) {
    return "Account number not provided on report";
  }
  return formatPacketAccountIdentifier(raw);
}

function safePdfFieldLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Account information";
  if (
    /[_:./-]/.test(raw) ||
    /[a-z][A-Z]/.test(raw) ||
    /artifact|tradeline|reference|rule\s*id/i.test(raw)
  ) {
    return formatPacketFieldLabel(raw);
  }
  return safePdfText(raw);
}

function buildDisputedAccountBlock(item: SimpleDisputedItem): string[] {
  const fieldLabel = safePdfFieldLabel(item.disputedField);
  const accountIdentifier = safePdfAccountIdentifier(item.maskedAccountNumber);
  const reportedValue = safePdfText(
    formatPacketDisplayValue(fieldLabel, item.reportedValue, item.maskedAccountNumber),
  );

  return [
    "Disputed Account",
    `Company reporting the account: ${safePdfText(item.creditorCollectorName)}`,
    `Account: ${accountIdentifier}`,
    `Information I am disputing: ${fieldLabel}`,
    `What the report shows: ${reportedValue}`,
    `What I am requesting: ${PDF_ITEM_REQUEST}`,
    "",
    "Reason for dispute:",
    safePdfText(item.explanation),
  ];
}

export function buildDisputePacketPdfLetterText(packet: SimpleDisputePacketContent): string {
  const lines: string[] = [
    safePdfDate(packet.dateGenerated),
    "",
    safePdfText(packet.recipient.name),
    ...packet.recipient.address.map((line) => safePdfText(line)).filter(Boolean),
    "",
    "Re: Request to investigate and correct credit report information",
    "",
    "Consumer:",
    safePdfText(packet.consumer.name),
    ...packet.consumer.address.map((line) => safePdfText(line)).filter(Boolean),
  ];

  if (packet.consumer.phone) lines.push(`Phone: ${safePdfText(packet.consumer.phone)}`);
  if (packet.consumer.email) lines.push(`Email: ${safePdfText(packet.consumer.email)}`);

  lines.push(
    "",
    "Credit report reviewed:",
    safePdfText(packet.reportType),
    `Report date: ${packet.reportDate ? safePdfDate(packet.reportDate) : "Information not provided on report"}`,
    "",
    safePdfText(packet.openingParagraph) || "I am writing to dispute the following information on my credit report.",
    "",
  );

  for (const item of packet.disputedItems) {
    lines.push(...buildDisputedAccountBlock(item), "");
  }

  lines.push("Sincerely,", "", "________________________________", safePdfText(packet.consumer.name));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function safePdfAttachmentList(items: string[]): string[] {
  return items.map((item) => safePdfText(item)).filter(Boolean);
}

export async function generateDisputePacketPDF(
  packet: SimpleDisputePacketContent,
  userId?: string,
  packetId?: string,
): Promise<string> {
  const watermarkConfig = userId && packetId ? generatePdfWatermark(userId, packetId) : null;
  const content: Content[] = [
    { text: buildDisputePacketPdfLetterText(packet), style: "bodyText", margin: [0, 0, 0, 14] },
    { text: "Attachment Checklist", style: "sectionHeading", margin: [0, 0, 0, 8] },
    bulletList(safePdfAttachmentList(packet.attachmentChecklist)),
  ];

  if (packet.signatureImage) {
    content.push({
      image: packet.signatureImage,
      width: 150,
      height: 50,
      margin: [0, 0, 0, 12],
    });
  }

  if (packet.consumerIdentificationImage) {
    content.push(
      {
        text: "Consumer Identification Attachment",
        style: "sectionHeading",
        pageBreak: "before",
        margin: [0, 0, 0, 8],
      },
      {
        text: packet.consumerIdentificationFileName
          ? `Identification image on file: ${packet.consumerIdentificationFileName}`
          : "Identification image on file",
        style: "bodyText",
        margin: [0, 0, 0, 12],
      },
      {
        image: packet.consumerIdentificationImage,
        fit: [450, 610],
        alignment: "center",
      },
    );
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    pageSize: "LETTER",
    pageMargins: [54, 54, 54, 54],
    ...(watermarkConfig?.watermark ? { watermark: watermarkConfig.watermark as any } : {}),
    ...(watermarkConfig?.info ? { info: watermarkConfig.info } : {}),
    defaultStyle: {
      font: "Roboto",
      fontSize: 10.5,
      lineHeight: 1.25,
    },
    styles: {
      title: {
        fontSize: 17,
        bold: true,
      },
      sectionHeading: {
        fontSize: 11,
        bold: true,
      },
      itemHeading: {
        fontSize: 10.5,
        bold: true,
      },
      bodyText: {
        fontSize: 10.5,
        lineHeight: 1.3,
      },
      smallText: {
        fontSize: 9.5,
        lineHeight: 1.2,
      },
      signature: {
        fontSize: 10.5,
      },
    },
    footer: (currentPage: number, pageCount: number): Content => {
      const stack: Content[] = [];
      if (pageCount > 1) {
        stack.push({
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "center",
          fontSize: 8,
          color: "#666666",
          margin: [0, 16, 0, 0],
        });
      }
      if (watermarkConfig?.footer) {
        stack.push(watermarkConfig.footer(currentPage, pageCount) as Content);
      }
      return stack.length ? { stack } : { text: "" };
    },
  };

  return generateServerPdf(docDefinition);
}
