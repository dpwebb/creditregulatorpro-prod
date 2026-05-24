import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { generatePdfWatermark } from "./contentMarker";
import { generateServerPdf } from "./pdfServerUtils";
import {
  buildConsumerDisputePacketLetterText,
  type SimpleDisputePacketContent,
} from "./disputePacketTemplate";
import { redactPacketSensitiveText } from "./disputePacketHumanization";
import { evaluatePacketNarrativeReadiness } from "./packetNarrative";

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

function assertPacketNarrativesReadyForPdf(packet: SimpleDisputePacketContent): void {
  const blockedItem = packet.disputedItems
    .map((item) => ({
      item,
      readiness: item.narrative ? evaluatePacketNarrativeReadiness(item.narrative) : null,
    }))
    .find(({ readiness }) => {
      if (!readiness) return false;
      return readiness.readinessBlockers.length > 0;
    });

  if (blockedItem) {
    const blocker = blockedItem.readiness?.readinessBlockers[0] ?? "Packet narrative is not ready.";
    throw new Error(
      `Packet narrative for finding ${blockedItem.item.issueId ?? "unknown"} is not ready for external PDF generation: ${blocker}`,
    );
  }
}

export function buildDisputePacketPdfLetterText(packet: SimpleDisputePacketContent): string {
  return buildConsumerDisputePacketLetterText(packet);
}

function safePdfAttachmentList(items: string[]): string[] {
  return items.map((item) => safePdfText(item)).filter(Boolean);
}

export async function generateDisputePacketPDF(
  packet: SimpleDisputePacketContent,
  userId?: string,
  packetId?: string,
): Promise<string> {
  assertPacketNarrativesReadyForPdf(packet);
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
