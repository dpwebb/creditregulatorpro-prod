import React from "react";
import { PenTool, Info, Eye, Mail } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import styles from "./TradelinePacketGenerationCard.module.css";

interface TradelinePacketGenerationCardProps {
  isGenerating: boolean;
  onGenerate: () => void;
  onViewCompliance: () => void;
  existingPacketId?: number | null;
  onViewPacket?: () => void;
  existingPacketStatus?: string | null;
  onRecordMailing?: () => void;
}

export const TradelinePacketGenerationCard: React.FC<TradelinePacketGenerationCardProps> = ({
  isGenerating,
  onGenerate,
  onViewCompliance,
  existingPacketId,
  onViewPacket,
  existingPacketStatus,
  onRecordMailing,
}) => {
  const hasExistingPacket = !!existingPacketId;
  const isReadyToMail = hasExistingPacket && existingPacketStatus === "Ready to Mail";

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        <PenTool size={18} />
        Create a Dispute Letter
        {isReadyToMail && (
          <Badge variant="warning" className={styles.statusBadge}>
            Ready to Mail
          </Badge>
        )}
      </h2>
      
      <div className={styles.actionBody}>
        <div className={styles.instructionContainer}>
          <p className={styles.instruction}>
            {hasExistingPacket
              ? isReadyToMail
                ? "Your letter is ready to mail. Record your mailing details after you've sent it."
                : "A dispute letter has already been generated for this account. You can view, print, or download the existing letter below."
              : "Create a dispute letter for this account. We'll pick the best approach and use the right legal template for your province."}
          </p>

          {!hasExistingPacket && (
            <div className={styles.complianceNote}>
              <Info size={14} className={styles.infoIcon} />
              <p>
                This creates <strong>one letter</strong> for a specific dispute step. To address multiple <strong>problems</strong>, you must generate a separate letter for each. Review and target specific issues in the <button type="button" onClick={onViewCompliance} className={styles.inlineLink}>Problems Found</button> tab.
              </p>
            </div>
          )}
        </div>

        {!hasExistingPacket && (
          <div className={styles.noticeBox}>
            <p>
              <strong>Note:</strong> Creating a letter requires your profile to be complete with your full name, address, and date of birth.
            </p>
          </div>
        )}

        <div className={styles.buttonGroup}>
          {hasExistingPacket ? (
            <>
              <Button
                variant="outline"
                onClick={onViewPacket}
                className={styles.fullWidth}
              >
                <Eye size={16} style={{ marginRight: "8px" }} />
                View Your Letter
              </Button>
              {isReadyToMail && (
                <Button
                  variant="default"
                  onClick={onRecordMailing}
                  className={styles.fullWidth}
                >
                  <Mail size={16} style={{ marginRight: "8px" }} />
                  Record Mailing
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="default"
              onClick={onGenerate}
              disabled={isGenerating}
              className={styles.fullWidth}
            >
              {isGenerating ? "Generating..." : "Create Dispute Letter"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};