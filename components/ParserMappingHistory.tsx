import React, { useState } from "react";
import { format } from "date-fns";
import { Selectable } from "kysely";
import { ParserMappingVersion } from "../helpers/schema";
import {
  useParserMappingHistory,
  useRollbackParserMapping,
} from "../helpers/parserMappingQueries";
import { useToast } from "../helpers/useToast";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./Accordion";
import styles from "./ParserMappingHistory.module.css";

interface Props {
  mappingId?: number;
}

export const ParserMappingHistory = ({ mappingId }: Props) => {
  const { data, isLoading, isError } = useParserMappingHistory(mappingId);
  const rollbackMutation = useRollbackParserMapping();
  const { showSuccess, showError } = useToast();
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const handleRollback = async (version: Selectable<ParserMappingVersion>) => {
    if (!window.confirm(`Are you sure you want to rollback to version ${version.versionNumber}?`)) {
      return;
    }
    
    setRollingBackId(version.id);
    try {
      await rollbackMutation.mutateAsync({ versionId: version.id });
      showSuccess(`Successfully rolled back to version ${version.versionNumber}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to rollback mapping");
    } finally {
      setRollingBackId(null);
    }
  };

  const getChangeTypeVariant = (type: string) => {
    switch (type.toLowerCase()) {
      case "create": return "success";
      case "update": return "primary";
      case "delete": return "error";
      case "rollback": return "warning";
      default: return "default";
    }
  };

  const formatDate = (date: Date | string) => {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Skeleton className={styles.skeletonRow} />
        <Skeleton className={styles.skeletonRow} />
        <Skeleton className={styles.skeletonRow} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.emptyState}>
        Failed to load version history.
      </div>
    );
  }

  if (!data?.versions || data.versions.length === 0) {
    return (
      <div className={styles.emptyState}>
        No historical changes found.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Accordion type="multiple" className={styles.accordionGroup}>
        {data.versions.map((v) => (
          <AccordionItem key={v.id} value={`v-${v.id}`} className={styles.historyItem}>
            <AccordionTrigger className={styles.trigger}>
              <div className={styles.triggerContent}>
                <div className={styles.triggerMeta}>
                  <Badge variant={getChangeTypeVariant(v.changeType)}>
                    {v.changeType.toUpperCase()}
                  </Badge>
                  <span className={styles.versionBadge}>v{v.versionNumber}</span>
                  <span className={styles.timestamp}>{formatDate(v.changedAt)}</span>
                </div>
                <div className={styles.triggerNotes}>
                  {v.notes || "No notes provided"}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className={styles.detailsContainer}>
                <div className={styles.actionRow}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRollback(v)}
                    disabled={rollingBackId === v.id || v.changeType === 'delete'}
                  >
                    {rollingBackId === v.id ? "Rolling back..." : "Rollback to this state"}
                  </Button>
                </div>
                
                <div className={styles.diffGrid}>
                  <div className={styles.diffCol}>
                    <div className={styles.diffHeader}>Previous State</div>
                    <pre className={styles.diffPre}>
                      <code>{v.previousState ? JSON.stringify(v.previousState, null, 2) : "null"}</code>
                    </pre>
                  </div>
                  <div className={styles.diffCol}>
                    <div className={styles.diffHeader}>New State</div>
                    <pre className={styles.diffPre}>
                      <code>{v.newState ? JSON.stringify(v.newState, null, 2) : "null"}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};