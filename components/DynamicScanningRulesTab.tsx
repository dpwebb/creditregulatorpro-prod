import { toast } from "sonner";
import { Trash2, CheckCircle, XCircle, Archive } from "lucide-react";

import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";

import {
  useScanningRules,
  useUpdateScanningRule,
  useDeleteScanningRule,
} from "../helpers/scanningRuleQueries";
import { DynamicRuleStatus } from "../helpers/schema";

import styles from "./DynamicScanningRulesTab.module.css";

export function DynamicScanningRulesTab() {
  const { data: rulesData, isLoading: isLoadingRules } = useScanningRules();
  const updateRuleMutation = useUpdateScanningRule();
  const deleteRuleMutation = useDeleteScanningRule();

  const handleUpdateRuleStatus = async (id: number, status: DynamicRuleStatus) => {
    try {
      await updateRuleMutation.mutateAsync({ id, status });
      toast.success(`Rule marked as ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update rule status");
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await deleteRuleMutation.mutateAsync({ id });
      toast.success("Rule deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    }
  };

  const getRuleStatusBadgeVariant = (status: DynamicRuleStatus) => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "PROPOSED":
        return "warning";
      case "REJECTED":
        return "error";
      case "ARCHIVED":
      default:
        return "default";
    }
  };

  const formatEnum = (value: string) => {
    return value.replace(/_/g, " ");
  };

  return (
    <div className={styles.rulesContent}>
      {isLoadingRules ? (
        <div className={styles.loading}>
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      ) : !rulesData?.rules || rulesData.rules.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No dynamic scanning rules found.</p>
        </div>
      ) : (
        <div className={styles.ruleGrid}>
          {rulesData.rules.map((rule) => (
            <div key={rule.id} className={styles.ruleCard}>
              <div className={styles.ruleHeader}>
                <h4 className={styles.ruleTitle}>{rule.title}</h4>
                <Badge variant={getRuleStatusBadgeVariant(rule.status)}>
                  {rule.status}
                </Badge>
              </div>
              <div className={styles.ruleBody}>
                <p className={styles.ruleDescription}>{rule.description}</p>

                {rule.regulatoryUpdateTitle && (
                  <div className={styles.ruleLinkedUpdate}>
                    <strong>Source Update:</strong> {rule.regulatoryUpdateTitle}
                  </div>
                )}

                <div className={styles.ruleMeta}>
                  <div>
                    <strong>Category:</strong> {formatEnum(rule.violationCategory)}
                  </div>
                  <div>
                    <strong>Severity:</strong> {rule.severity}
                  </div>
                  <div>
                    <strong>Confidence:</strong> {Number(rule.confidenceScore)}
                  </div>
                </div>

                <div className={styles.ruleCode}>
                  <pre>{JSON.stringify(rule.ruleDefinition, null, 2)}</pre>
                </div>
              </div>
              <div className={styles.ruleFooter}>
                <div className={styles.ruleActions}>
                  {rule.status === "PROPOSED" && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleUpdateRuleStatus(rule.id, "ACTIVE")}
                        disabled={updateRuleMutation.isPending}
                      >
                        <CheckCircle size={14} /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleUpdateRuleStatus(rule.id, "REJECTED")}
                        disabled={updateRuleMutation.isPending}
                      >
                        <XCircle size={14} /> Reject
                      </Button>
                    </>
                  )}
                  {rule.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleUpdateRuleStatus(rule.id, "ARCHIVED")}
                      disabled={updateRuleMutation.isPending}
                    >
                      <Archive size={14} /> Archive
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className={styles.deleteRuleBtn}
                    onClick={() => handleDeleteRule(rule.id)}
                    disabled={deleteRuleMutation.isPending}
                  >
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}