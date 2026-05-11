import { useState } from "react";
import { FileText, FileSearch, Eye, ChevronDown } from "lucide-react";
import { HelpTooltip } from "./HelpTooltip";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./Collapsible";
import { formatDateTime } from "../helpers/formatters";
import { ObligationTestWithDetails } from "../endpoints/creditor-validation/list_GET.schema";
import { getViolationDisplayLabel } from "../helpers/getViolationLabel";
import { getRegulationsForViolation } from "../helpers/violationRegulationMap";
import { getEnrichedExplanation, getEnrichedRecommendedAction } from "../helpers/getEnrichedExplanation";
import styles from "./ComplianceViolationCard.module.css";

const PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

interface ViolationCardProps {
  violation: ObligationTestWithDetails;
  tradelineId: number;
  disabled?: boolean;
  reportArtifactId?: number | null;
  sourceText?: string | null;
  onViewSource?: () => void;
  hasExistingPacket?: boolean;
  onViewPacket?: () => void;
  isDisputed?: boolean;
  onDismiss?: (violationId: number, status: "dismissed" | "verified", reason?: string) => void;
  isDismissed?: boolean;
  dismissReason?: string | null;
}

type LegalReferenceForLabel = {
  statute?: string | null;
  section?: string | null;
  citation?: string | null;
  id?: string | null;
};

export function buildLegalReferenceTriggerLabel(regulations: LegalReferenceForLabel[]): string {
  const references = regulations
    .map((reg) =>
      [reg.statute, reg.section || reg.citation || reg.id]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  const primary = references[0] ?? "the mapped rule or reference";
  const remaining = references.length > 1
    ? ` and ${references.length - 1} more reference${references.length === 2 ? "" : "s"}`
    : "";

  return `This item may require review under ${primary}${remaining}`;
}

export const ComplianceViolationCard = ({
  violation,
  disabled,
  reportArtifactId,
  onViewSource,
  hasExistingPacket,
  onViewPacket,
  isDisputed,
  onDismiss,
  isDismissed,
  dismissReason,
}: ViolationCardProps) => {
  const regulations = getRegulationsForViolation({
    violationCategory: violation.violationCategory,
    technicalDetails: violation.technicalDetails,
  });

  const enrichedRecommendedAction = getEnrichedRecommendedAction(violation);
  const hasRecommendationsOrRegulations = enrichedRecommendedAction || regulations.length > 0;
  const isPrimaryViolation = violation.violationCategory === "STATUTE_OF_LIMITATIONS";
  const isLicenseFailure = violation.violationCategory === "COLLECTOR_LICENSE_FAILURE";
  const isLinkedDisputed = violation.obligationState === "ADDRESSED_VIA_LINKED_DISPUTE";
  const [isLawsOpen, setIsLawsOpen] = useState(false);
  const authorityTriggerLabel = buildLegalReferenceTriggerLabel(regulations);

  return (
    <div className={`${styles.violationCard} ${isPrimaryViolation && !isDismissed ? styles.primaryViolationCard : ''} ${isDisputed && !isDismissed ? styles.disputedCard : ''} ${isLinkedDisputed && !isDismissed ? styles.linkedDisputedCard : ''} ${isDismissed ? styles.dismissedCard : ''}`}>
      <div className={styles.cardHeader}>
        <div className={styles.badges}>
          {isDismissed ? (
            <Badge variant="default" className={styles.dismissedBadge}>
              DISMISSED
            </Badge>
          ) : (
            <>
              {isLinkedDisputed && (
                <Badge variant="info" className={styles.disputedBadge}>
                  ADDRESSED VIA LINKED ACCOUNT
                </Badge>
              )}
              {isDisputed && !isLinkedDisputed && (
                <Badge variant="success" className={styles.disputedBadge}>
                  DISPUTED — AWAITING RESPONSE
                </Badge>
              )}
              {isPrimaryViolation && (
                <Badge variant="error" className={styles.primaryBadge}>
                  MAIN PROBLEM
                </Badge>
              )}
              <Badge variant="default" className={styles.categoryBadge}>
                {getViolationDisplayLabel(violation)}
              </Badge>
              {violation.technicalDetails?.province && (
                <Badge variant="info" className={styles.categoryBadge}>
                  {PROVINCE_NAMES[violation.technicalDetails.province] || violation.technicalDetails.province}
                </Badge>
              )}
              {violation.technicalDetails?.responsibleEntity === "BUREAU" && (
                <Badge variant="warning" className={styles.categoryBadge}>
                  BUREAU ISSUE
                </Badge>
              )}
              {violation.technicalDetails?.responsibleEntity === "CREDITOR" && (
                <Badge variant="default" className={styles.categoryBadge}>
                  COMPANY ISSUE
                </Badge>
              )}
              {violation.technicalDetails?.responsibleEntity === "COLLECTOR" && (
                <Badge variant="error" className={styles.categoryBadge}>
                  COLLECTOR ISSUE
                </Badge>
              )}
            </>
          )}
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.findingId}>Finding #{violation.id}</span>
          <span className={styles.timestamp}>
            Detected {formatDateTime(violation.detectedAt)}
          </span>
        </div>
      </div>

            <div className={styles.explanation}>
        {getEnrichedExplanation(violation) || "No explanation provided."}
      </div>
      
      {isDismissed && dismissReason && (
        <div className={styles.dismissReason}>
          Reason: {dismissReason}
        </div>
      )}
      
      {isLicenseFailure && !isDismissed && violation.technicalDetails && (violation.technicalDetails.aiConfidence || violation.technicalDetails.registryUrl) && (
        <div className={styles.licenseCheckBox}>
          {violation.technicalDetails.aiConfidence && (
            <div className={styles.aiConfidence}>
              AI analysis: {violation.technicalDetails.aiConfidence}% likely licensed
            </div>
          )}
          {violation.technicalDetails.registryUrl && (
            <Button 
              variant="link" 
              className={styles.registryLink}
              asChild
            >
              <a href={violation.technicalDetails.registryUrl} target="_blank" rel="noopener noreferrer">
                Check the provincial registry →
              </a>
            </Button>
          )}
        </div>
      )}

      {hasRecommendationsOrRegulations && !isDismissed && (
        <div className={styles.recommendationBox}>
          {enrichedRecommendedAction && (
            <p>
              <strong>What to do:</strong> {enrichedRecommendedAction}
            </p>
          )}

          {regulations.length > 0 && (
            <Collapsible
              open={isLawsOpen}
              onOpenChange={setIsLawsOpen}
              className={styles.lawsCollapsible}
            >
              <CollapsibleTrigger asChild>
                <button className={styles.lawsTrigger} data-state={isLawsOpen ? "open" : "closed"}>
                  <FileSearch size={14} />
                  {authorityTriggerLabel}
                  <ChevronDown size={14} className={styles.lawsTriggerIcon} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={styles.regulationList}>
                  <ul className={styles.regulationItems}>
                    {regulations.map((reg, idx) => (
                      <li key={idx} className={styles.regulationItem}>
                        <div className={styles.regulationHeader}>
                          <span className={styles.regulationStatute}>{reg.statute}</span>
                          <span className={styles.regulationSection}>{reg.section}</span>
                          {reg.authorityIssueLabel && (
                            <span className={styles.authorityClassification}>{reg.authorityIssueLabel}</span>
                          )}
                        </div>
                        {reg.specificApplication && (
                          <span className={styles.regulationApplication}>
                            {reg.specificApplication}
                          </span>
                        )}
                        <span className={styles.regulationDescription}>
                          "{reg.description}"
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {/* Individual Action Section */}
      {!isDismissed && (
      <div className={styles.actionFooter}>
        <div className={styles.actionInfo}>
          <div className={styles.actionIconWrapper}>
            <FileText size={16} className={styles.actionIcon} />
          </div>
        <div className={styles.actionText}>
          <span className={styles.actionLabel}>Tip:</span>
          <span className={styles.actionDescription}>
            {isDisputed 
              ? "Your dispute letter has been sent. The bureau has 30 days to respond."
              : "Send a separate letter for this problem — it works better than combining them."}
          </span>
        </div>
        </div>
        <div className={styles.actionButtons}>
          {onDismiss && !isLinkedDisputed && (
            <div className={styles.dismissActions}>
              <Button
                size="sm"
                variant="outline"
                className={styles.actionButton}
                onClick={() => onDismiss(violation.id, "dismissed")}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`${styles.actionButton} ${styles.verifyButton}`}
                onClick={() => onDismiss(violation.id, "verified")}
              >
                I Verified This
              </Button>
            </div>
          )}
          {onViewSource && (
            <Button
              size="sm"
              variant="ghost"
              className={styles.actionButton}
              onClick={onViewSource}
              disabled={disabled || !reportArtifactId}
              title={
                !reportArtifactId
                  ? "Original report not available"
                  : "See where this problem appears in your report"
              }
            >
              <FileSearch size={14} /> See Original Report
            </Button>
          )}
          {isLinkedDisputed ? (
            <span className={styles.linkedDisputeText}>
              A dispute letter was already sent from the linked duplicate account.
            </span>
          ) : hasExistingPacket && onViewPacket ? (
            <Button
              size="sm"
              variant="default"
              className={`${styles.actionButton} ${isDisputed ? styles.successButton : ''}`}
              onClick={onViewPacket}
              title="See the letter already created for this"
            >
              <Eye size={14} /> View Letter
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className={styles.actionButton}
              disabled
              title="The dispute packet flow is being redesigned"
            >
              Dispute Flow Reset
            </Button>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
