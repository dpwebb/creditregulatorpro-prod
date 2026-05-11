import {
  applyEvidentiaryDisputeStructure,
  type EvidentiaryStructureContext,
} from "./disputeLetterStructure";
import { letterHumanizer } from "./letterHumanizer";
import type { LetterContent } from "./pdfGenerator";

export async function finalizePacketLetterContent(
  letterContent: LetterContent,
  context: EvidentiaryStructureContext
): Promise<LetterContent> {
  const humanized = await letterHumanizer(letterContent);
  return applyEvidentiaryDisputeStructure(humanized, context);
}
