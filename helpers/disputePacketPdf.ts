import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { generatePdfWatermark } from "./contentMarker";
import { generateServerPdf } from "./pdfServerUtils";
import {
  buildConsumerDisputePacketLetterText,
  type SimpleDisputePacketContent,
} from "./disputePacketTemplate";

function bulletList(items: string[]): Content {
  return {
    ul: items.length > 0 ? items : ["Needs manual review"],
    style: "bodyText",
    margin: [0, 0, 0, 12],
  };
}

export async function generateDisputePacketPDF(
  packet: SimpleDisputePacketContent,
  userId?: string,
  packetId?: string,
): Promise<string> {
  const watermarkConfig = userId && packetId ? generatePdfWatermark(userId, packetId) : null;
  const content: Content[] = [
    { text: buildConsumerDisputePacketLetterText(packet), style: "bodyText", margin: [0, 0, 0, 14] },
    { text: "Attachment Checklist", style: "sectionHeading", margin: [0, 0, 0, 8] },
    bulletList(packet.attachmentChecklist),
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
      tableHeader: {
        fontSize: 8.5,
        bold: true,
        fillColor: "#f3f4f6",
      },
      tableCell: {
        fontSize: 8.2,
        lineHeight: 1.15,
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
