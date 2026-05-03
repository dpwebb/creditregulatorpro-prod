import { useState } from "react";
import { Download, FileText, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { useGeneratePackageMutation } from "../helpers/attachmentQueries";
import { formatDate } from "../helpers/formatters";
import styles from "./TradelineExportSection.module.css";

interface TradelineExportSectionProps {
  tradelineId: number;
}

export const TradelineExportSection = ({ tradelineId }: TradelineExportSectionProps) => {
  const { data, isLoading } = useObligationInstanceList({ tradelineId });
  const generatePackageMutation = useGeneratePackageMutation();
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  const handleExport = (obligationInstanceId: number) => {
    setGeneratingId(obligationInstanceId);
    generatePackageMutation.mutate(
      { obligationInstanceId },
      {
        onSettled: () => setGeneratingId(null),
      }
    );
  };

  const instances = data?.instances || [];

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <ShieldCheck size={18} />
          Download Your Proof
        </h2>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.description}>
          Download a PDF with all your proof, records, and files in one place — ready to use if needed.
        </p>

        {isLoading ? (
          <div className={styles.loadingContainer}>
            <Skeleton className="w-full h-16" />
            <Skeleton className="w-full h-16" />
          </div>
        ) : instances.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertCircle size={24} />
            <p>No dispute steps found for this account.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {instances.map((instance) => (
              <div key={instance.id} className={styles.instanceItem}>
                <div className={styles.instanceInfo}>
                  <div className={styles.instanceHeader}>
                    <span className={styles.disputeVector}>
                      {instance.disputeVector || "General Dispute"}
                    </span>
                    <Badge
                      variant={
                        instance.state === "PROCEDURALLY_EXHAUSTED"
                          ? "success"
                          : "default"
                      }
                      className={styles.statusBadge}
                    >
                      {instance.state === "PROCEDURALLY_EXHAUSTED"
                        ? "All Steps Complete"
                        : instance.state?.replace(/_/g, " ") || "Pending"}
                    </Badge>
                  </div>
                  <span className={styles.date}>
                    Created:{" "}
                    {instance.createdAt
                      ? formatDate(instance.createdAt)
                      : "Unknown"}
                  </span>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(instance.id)}
                      disabled={generatePackageMutation.isPending}
                      className={styles.exportButton}
                    >
                      {generatingId === instance.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Export PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Download your full proof package as a PDF
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};