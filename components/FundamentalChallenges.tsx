import React, { useMemo } from "react";
import { Scale } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import {
  generateAccessPointsForTradelines,
  SimpleTradeline,
} from "../helpers/challengeAccessPointGenerator";
import styles from "./FundamentalChallenges.module.css";

interface FundamentalChallengesProps {
  tradelineId: number;
  creditorName: string;
  status: string | null;
  isCollectionAccount: boolean;
  bureauId: number | null;
  accountNumber: string | null;
  onCreateChallengeLetter: (challengeAccessPointId: string) => void;
  className?: string;
}

export const FundamentalChallenges: React.FC<FundamentalChallengesProps> = ({
  tradelineId,
  creditorName,
  status,
  isCollectionAccount,
  bureauId,
  accountNumber,
  onCreateChallengeLetter,
  className,
}) => {
  const accessPoints = useMemo(() => {
    // We inject "collection" into the status if the boolean is true
    // to ensure the heuristic in the generator correctly identifies it
    // even if the raw status string lacks the exact word.
    const effectiveStatus = isCollectionAccount
      ? `${status || ""} collection`.trim()
      : status || "";

    const simpleTradeline: SimpleTradeline = {
      id: tradelineId,
      creditorName: creditorName || "Unknown",
      accountNumber: accountNumber || "Unknown",
      status: effectiveStatus,
      bureauCode: bureauId?.toString() || null,
    };

    return generateAccessPointsForTradelines([simpleTradeline]);
  }, [
    tradelineId,
    creditorName,
    status,
    isCollectionAccount,
    bureauId,
    accountNumber,
  ]);

  if (!accessPoints || accessPoints.length === 0) {
    return null;
  }

  const getEntityBadgeVariant = (entityType: string) => {
    switch (entityType) {
      case "BUREAU":
        return "info";
      case "COLLECTOR":
        return "warning";
      case "CREDITOR":
      default:
        return "default";
    }
  };

  const formatEntityType = (entityType: string) => {
    if (!entityType) return "";
    return entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase();
  };

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return styles.priorityHigh;
      case "MEDIUM":
        return styles.priorityMedium;
      case "LOW":
        return styles.priorityLow;
      default:
        return styles.priorityLow;
    }
  };

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <div className={styles.introHeader}>
        <Scale className={styles.introIcon} size={24} />
        <h3 className={styles.introTitle}>Procedural Challenges</h3>
      </div>
      <p className={styles.introText}>
        Even if we didn't find a specific error, you have the right to challenge
        how your information is being handled. These are formal requests you can
        send.
      </p>

      <div className={styles.cardList}>
        {accessPoints.map((point) => (
          <div
            key={point.id}
            className={`${styles.card} ${getPriorityClass(point.priority)}`}
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <h4 className={styles.cardTitle}>{point.label}</h4>
                <Badge variant={getEntityBadgeVariant(point.entityType)}>
                  {formatEntityType(point.entityType)}
                </Badge>
              </div>
            </div>
            
            <p className={styles.cardDescription}>{point.description}</p>
            
            <div className={styles.cardFooter}>
              <Button
                variant="outline"
                onClick={() => onCreateChallengeLetter(point.id)}
              >
                Send Challenge Letter
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};