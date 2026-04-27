import React from "react";
import { RefreshCw } from "lucide-react";
import { useRescanCompliance } from "../helpers/useRescanCompliance";
import { Button } from "./Button";
import styles from "./ComplianceRescanButton.module.css";

interface Props {
  tradelineId: number;
  className?: string;
}

export const ComplianceRescanButton = ({ tradelineId, className }: Props) => {
  const { mutate, isPending } = useRescanCompliance();

  const handleRescan = () => {
    mutate({ tradelineId });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRescan}
      disabled={isPending}
      className={`${styles.rescanButton} ${className || ""}`}
    >
      <RefreshCw size={14} className={isPending ? styles.spinning : ""} />
      {isPending ? "Checking..." : "Check Again"}
    </Button>
  );
};