import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { generatePdfWatermark } from "./contentMarker";
import { generateServerPdf } from "./pdfServerUtils";
import type { SimpleDisputePacketContent } from "./disputePacketTemplate";

function linesBlock(title: string, lines: Array<string | null | undefined>): Content {
  const safeLines = lines.filter((line): line is string => Boolean(line && line.trim()));
  return {
    stack: [
      { text: title, style: "sectionHeading" },
      ...safeLines.map((line) => ({ text: line, style: "smallText" })),
    ],
    margin: [0, 0, 0, 12],
  };
}

function bulletList(items: string[]): Content {
  return {
    ul: items.length > 0 ? items : ["Needs manual review"],
    style: "bodyText",
    margin: [0, 0, 0, 12],
  };
}

function buildDisputedItemsTable(packet: SimpleDisputePacketContent): Content {
  return {
    table: {
      headerRows: 1,
      widths: ["*", "auto", "*", "*", "*", "*"],
      body: [
        [
          { text: "Creditor/collector", style: "tableHeader" },
          { text: "Account", style: "tableHeader" },
          { text: "Field", style: "tableHeader" },
          { text: "Reported", style: "tableHeader" },
          { text: "Expected", style: "tableHeader" },
          { text: "Requested action", style: "tableHeader" },
        ],
        ...packet.disputedItems.map((item) => [
          { text: item.creditorCollectorName, style: "tableCell" },
          { text: item.maskedAccountNumber, style: "tableCell" },
          { text: item.disputedField, style: "tableCell" },
          { text: item.reportedValue, style: "tableCell" },
          { text: item.correctedExpectedValue, style: "tableCell" },
          { text: item.requestedAction, style: "tableCell" },
        ]),
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 0, 0, 14],
  };
}

function buildExplanationItems(packet: SimpleDisputePacketContent): Content[] {
  return packet.disputedItems.flatMap((item, index) => [
    {
      text: `${index + 1}. ${item.creditorCollectorName} - ${item.maskedAccountNumber}`,
      style: "itemHeading",
      margin: [0, 0, 0, 4],
    },
    {
      text: item.needsManualReview
        ? `${item.explanation} Evidence reference: Needs manual review.`
        : `${item.explanation} Evidence reference: ${item.evidenceReference}.`,
      style: "bodyText",
      margin: [0, 0, 0, 10],
    },
  ]);
}

export async function generateDisputePacketPDF(
  packet: SimpleDisputePacketContent,
  userId?: string,
  packetId?: string,
): Promise<string> {
  const watermarkConfig = userId && packetId ? generatePdfWatermark(userId, packetId) : null;
  const content: Content[] = [
    { text: packet.title, style: "title", margin: [0, 0, 0, 10] },
    { text: `Date generated: ${packet.dateGenerated}`, style: "smallText", margin: [0, 0, 0, 12] },
    linesBlock("Recipient", [packet.recipient.name, ...packet.recipient.address]),
    linesBlock("Consumer", [
      packet.consumer.name,
      ...packet.consumer.address,
      packet.consumer.phone ? `Phone: ${packet.consumer.phone}` : null,
      packet.consumer.email ? `Email: ${packet.consumer.email}` : null,
    ]),
    linesBlock("Report", [
      `Report type: ${packet.reportType}`,
      packet.reportDate ? `Report date: ${packet.reportDate}` : "Report date: Not known",
    ]),
    { text: packet.openingParagraph, style: "bodyText", margin: [0, 0, 0, 14] },
    { text: "Disputed Items", style: "sectionHeading", margin: [0, 0, 0, 8] },
    buildDisputedItemsTable(packet),
    { text: "Explanation", style: "sectionHeading", margin: [0, 0, 0, 8] },
    ...buildExplanationItems(packet),
    { text: "Requested Action", style: "sectionHeading", margin: [0, 0, 0, 8] },
    { text: packet.requestedActionSummary, style: "bodyText", margin: [0, 0, 0, 12] },
    { text: "Evidence List", style: "sectionHeading", margin: [0, 0, 0, 8] },
    bulletList(packet.evidenceList),
    { text: "Attachment Checklist", style: "sectionHeading", margin: [0, 0, 0, 8] },
    bulletList(packet.attachmentChecklist),
    { text: packet.signatureLine, style: "signature", margin: [0, 18, 0, 10] },
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
