import {
  buildConsumerDisputePacketLetterText,
  type SimpleDisputePacketContent,
} from "./disputePacketTemplate";
import {
  formatPacketDisplayDate,
  formatPacketFieldLabel,
  redactPacketSensitiveText,
} from "./disputePacketHumanization";

export interface PacketPreviewDisplayContent {
  letterText: string;
  evidenceSummary: string[];
  attachmentChecklist: string[];
}

function sanitizePacketPreviewLine(value: unknown): string {
  return redactPacketSensitiveText(value)
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, (match) => formatPacketDisplayDate(match))
    .replace(/\bsource\s+report\s*#/gi, "credit report ")
    .replace(/\bsource report\b/gi, "credit report")
    .replace(/\breport artifact\b/gi, "credit report")
    .replace(/\bartifact\b/gi, "credit report")
    .replace(/\btradeline\b/gi, "account record")
    .replace(/\bfield\s*:/gi, "reported item:")
    .replace(/\bAccount ending\s+reau\b/gi, "Account identifier unavailable")
    .replace(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g, (match) => formatPacketFieldLabel(match))
    .replace(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/g, (match) => formatPacketFieldLabel(match))
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePacketPreviewList(items: string[]): string[] {
  return items.map((item) => sanitizePacketPreviewLine(item)).filter(Boolean);
}

export function buildPacketPreviewDisplayContent(packet: SimpleDisputePacketContent): PacketPreviewDisplayContent {
  return {
    letterText: buildConsumerDisputePacketLetterText(packet),
    evidenceSummary: sanitizePacketPreviewList(packet.evidenceList),
    attachmentChecklist: sanitizePacketPreviewList(packet.attachmentChecklist),
  };
}
