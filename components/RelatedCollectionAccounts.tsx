import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "../helpers/formatters";
import { Badge } from "./Badge";
import { Button } from "./Button";
import styles from "./RelatedCollectionAccounts.module.css";

export type LinkedDisputeStatus = 'none' | 'created' | 'sent';

export interface RelatedTradeline {
  id: number;
  accountNumber: string;
  collectionAgencyName: string | null;
  creditorName: string | null;
  balance: string | number | null;
  dateAssignedToCollection: Date | string | null;
  status: string | null;
  linkedDisputeStatus?: LinkedDisputeStatus;
}

interface RelatedCollectionAccountsProps {
  relatedTradelines?: RelatedTradeline[];
  className?: string;
  onCreateDispute?: () => void;
  onViewPacket?: () => void;
}

function resolveOverallDisputeStatus(
  tradelines: RelatedTradeline[]
): LinkedDisputeStatus {
  if (tradelines.some((t) => t.linkedDisputeStatus === 'sent')) return 'sent';
  if (tradelines.some((t) => t.linkedDisputeStatus === 'created')) return 'created';
  return 'none';
}

export const RelatedCollectionAccounts = ({
    relatedTradelines,
  className,
  onCreateDispute,
  onViewPacket,
}: RelatedCollectionAccountsProps) => {
  if (!relatedTradelines || relatedTradelines.length === 0) {
    return null;
  }

  const overallStatus = resolveOverallDisputeStatus(relatedTradelines);

  const isSent = overallStatus === 'sent';
  const isCreated = overallStatus === 'created';

  const containerClass = [
    styles.container,
    isSent ? styles.containerSuccess : isCreated ? styles.containerInfo : styles.containerWarning,
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  const title = isSent
    ? "Dispute Letter Sent for This Duplicate Debt"
    : isCreated
    ? "Dispute Letter Created for This Duplicate Debt"
    : "This debt is also reported by another collector";

  const description = isSent
    ? "A dispute letter has already been sent for this duplicate debt. Monitor the response from the collectors and bureaus in your packets section."
    : isCreated
    ? "A dispute letter has been created for this duplicate debt but has not been sent yet. Review and send it from your packets section."
    : "We found other accounts that look like the exact same debt. Having the same debt show up more than once can hurt your score unfairly.";

  const badge = isSent ? (
    <Badge variant="success" className={styles.badge}>
      Letter Sent ✓
    </Badge>
  ) : isCreated ? (
    <Badge variant="info" className={styles.badge}>
      Letter Created
    </Badge>
  ) : (
    <Badge variant="warning" className={styles.badge}>
      Action Needed
    </Badge>
  );

  const iconEmoji = isSent ? "✅" : isCreated ? "📄" : "⚠️";

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          <span className={styles.icon}>{iconEmoji}</span>
          {title}
        </h3>
        {badge}
      </div>

      <p className={styles.description}>{description}</p>

      <div className={styles.list}>
        {relatedTradelines.map((tradeline) => {
          const name =
            tradeline.collectionAgencyName ||
            tradeline.creditorName ||
            "Unknown Collector";

          const balanceNum =
            typeof tradeline.balance === "string"
              ? parseFloat(tradeline.balance)
              : tradeline.balance;

          return (
            <div key={tradeline.id} className={styles.item}>
              <div className={styles.details}>
                <span className={styles.name}>{name}</span>
                <span className={styles.meta}>
                  Account ending in {tradeline.accountNumber.slice(-4) || "****"}
                  {tradeline.dateAssignedToCollection &&
                    ` • Assigned on ${formatDate(tradeline.dateAssignedToCollection)}`}
                </span>
              </div>

              <div className={styles.actions}>
                <div className={styles.balanceContainer}>
                  <span className={styles.balanceLabel}>Balance</span>
                  <span className={styles.balance}>
                    {formatCurrency(balanceNum) || "N/A"}
                  </span>
                </div>

                <Button asChild variant="secondary" size="sm">
                  <Link to={`/tradelines/${tradeline.id}`}>
                    View Account →
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

            {(onCreateDispute || onViewPacket) && !isSent && (
        <div className={styles.footer}>
                    <Button
            size="lg"
            variant={isCreated ? "secondary" : "destructive"}
            onClick={isCreated && onViewPacket ? onViewPacket : onCreateDispute}
          >
            {isCreated ? "Review & Send Letter" : "Create Dispute Letter"}
          </Button>
        </div>
      )}
    </div>
  );
};