import { attachConsumerIdentificationToLetterContent } from "./consumerIdentification";
import { generateDisputePacketPDF } from "./disputePacketPdf";
import {
  isSimpleDisputePacketContent,
  type SimpleDisputePacketContent,
} from "./disputePacketTemplate";
import { generatePDF, type LetterContent } from "./pdfGenerator";

export type ParsedPacketContent = LetterContent | SimpleDisputePacketContent;

export function parseStoredPacketContent(content: string): ParsedPacketContent {
  return JSON.parse(content) as ParsedPacketContent;
}

export function attachIdentificationToPacketContent(
  content: ParsedPacketContent,
  identification: { fileName: string; dataUrl: string },
): void {
  if (isSimpleDisputePacketContent(content)) {
    const idNote = "Consumer identification image, if required by the recipient";
    if (!content.attachmentChecklist.some((item) => item.toLowerCase().includes("identification"))) {
      content.attachmentChecklist.push(idNote);
    }
    content.consumerIdentificationImage = identification.dataUrl;
    content.consumerIdentificationFileName = identification.fileName;
    return;
  }

  attachConsumerIdentificationToLetterContent(content, identification);
}

export function applySignatureToPacketContent(content: ParsedPacketContent, signatureData: string): void {
  content.signatureImage = signatureData;
}

export function applyRecipientOverrideToPacketContent(
  content: ParsedPacketContent,
  recipient: {
    name?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  },
): void {
  if (
    !recipient.name ||
    !recipient.addressLine1 ||
    !recipient.city ||
    !recipient.province ||
    !recipient.postalCode
  ) {
    return;
  }

  const address = [
    recipient.addressLine1,
    recipient.addressLine2,
    `${recipient.city}, ${recipient.province} ${recipient.postalCode}`,
  ].filter((line): line is string => Boolean(line));

  if (isSimpleDisputePacketContent(content)) {
    content.recipient = {
      ...content.recipient,
      name: recipient.name,
      address,
    };
    return;
  }

  content.recipientName = recipient.name;
  content.recipientAddress = address;
}

export async function generatePacketContentPdfBase64(
  content: ParsedPacketContent,
  userId?: string,
  packetId?: string,
): Promise<string> {
  if (isSimpleDisputePacketContent(content)) {
    return generateDisputePacketPDF(content, userId, packetId);
  }

  return generatePDF(content, userId, packetId);
}
