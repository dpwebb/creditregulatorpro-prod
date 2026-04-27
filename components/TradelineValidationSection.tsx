import React from "react";
import { ShieldCheck } from "lucide-react";
import { Metro2ValidationPanel } from "./Metro2ValidationPanel";
import styles from "./TradelineValidationSection.module.css";

interface TradelineValidationSectionProps {
  tradelineId: number;
  className?: string;
}

export const TradelineValidationSection: React.FC<TradelineValidationSectionProps> = ({
  tradelineId,
  className,
}) => {
  return (
    <section className={`${styles.section} ${className || ""}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <ShieldCheck size={20} className={styles.icon} />
          Reporting Format Check
        </h2>
        <p className={styles.description}>
          We checked how your account is being reported to make sure it follows the rules.
        </p>
      </div>
      <div className={styles.content}>
        <Metro2ValidationPanel tradelineId={tradelineId} />
      </div>
    </section>
  );
};