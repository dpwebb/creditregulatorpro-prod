import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "./Dialog";
import { Button } from "./Button";
import { Input } from "./Input";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useCreateVersion, useChangeSummary } from "../helpers/versionQueries";
import { useToast } from "../helpers/useToast";
import { Skeleton } from "./Skeleton";
import { Badge } from "./Badge";
import styles from "./AdminVersionCreateDialog.module.css";

export const AdminVersionCreateDialog = () => {
  const [open, setOpen] = useState(false);
  const [codename, setCodename] = useState("");
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [manualVersion, setManualVersion] = useState("");
  
  const createMutation = useCreateVersion();
  const { data: summary, isLoading: isSummaryLoading } = useChangeSummary({ enabled: open });
  const { showSuccess, showError } = useToast();

  const bumpPatch = (version: string): string => {
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return version;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    return `${major}.${minor}.${patch + 1}`;
  };

  const handleCreate = async () => {
    if (!summary && !manualVersion) return;
    
    try {
      const automaticFallbackVersion =
        !showManualOverride &&
        summary?.highestLevel === "none" &&
        summary.lastReleasedVersion
          ? bumpPatch(summary.lastReleasedVersion)
          : undefined;

      await createMutation.mutateAsync({
        codename: codename || undefined,
        version: showManualOverride && manualVersion ? manualVersion : automaticFallbackVersion,
      });
      showSuccess("Version created successfully");
      setOpen(false);
      setCodename("");
      setManualVersion("");
      setShowManualOverride(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create version");
    }
  };

  const isCreateDisabled =
    createMutation.isPending ||
    !summary ||
    (showManualOverride && !manualVersion);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus size={16} /> Create New Version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Version</DialogTitle>
          <DialogDescription>
            Review change summary and create a new version
          </DialogDescription>
        </DialogHeader>

        <div className={styles.summarySection}>
          <h4 className={styles.sectionTitle}>Change Summary</h4>
          {isSummaryLoading ? (
            <div className={styles.loadingBox}>
              <Skeleton style={{ height: "1.5rem", width: "100%", marginBottom: "0.5rem" }} />
              <Skeleton style={{ height: "1.5rem", width: "100%", marginBottom: "0.5rem" }} />
              <Skeleton style={{ height: "1.5rem", width: "80%" }} />
            </div>
          ) : !summary ? (
            <div className={styles.noChanges}>Failed to load change summary.</div>
          ) : summary.highestLevel === 'none' ? (
            <div className={styles.noChanges}>
              No changes detected since last release. Creating a version now will auto-bump the patch version unless you set a manual override.
            </div>
          ) : (
            <div className={styles.previewBox}>
              <div className={styles.changesList}>
                {(['MAJOR', 'MINOR', 'PATCH'] as const).map(level => {
                  const levelChanges = summary.changes.filter(c => c.level === level);
                  if (levelChanges.length === 0) return null;
                  return (
                    <div key={level} className={styles.levelGroup}>
                      <h5 className={styles.levelGroupTitle}>{level} Changes</h5>
                      {levelChanges.map((change, idx) => (
                        <div key={idx} className={styles.changeItem}>
                          <span className={styles.changeType}>
                            {change.entityType.toLowerCase().replace(/_/g, ' ')} / {change.actionType.toLowerCase().replace(/_/g, ' ')}
                          </span>
                          <span className={styles.changeDetails}>
                            x <span className={styles.changeTotal}>{change.count}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className={styles.scoreRow}>
                <span className={styles.previewLabel}>Total Operations:</span>
                <span className={styles.previewValue}>{summary.totalOperations}</span>
              </div>
              <div className={styles.scoreRow}>
                <span className={styles.previewLabel}>Highest Level:</span>
                <Badge variant={summary.highestLevel === 'MAJOR' ? 'error' : summary.highestLevel === 'MINOR' ? 'warning' : 'default'}>
                  {summary.highestLevel}
                </Badge>
              </div>
              <div className={styles.scoreRow}>
                <span className={styles.previewLabel}>Suggested Version:</span>
                <span className={styles.previewValueHighlight}>v{summary.suggestedVersion}</span>
              </div>
              {summary.lastReleasedVersion && (
                <div className={styles.scoreRow}>
                  <span className={styles.previewLabel}>Last Release:</span>
                  <span className={styles.previewValue}>v{summary.lastReleasedVersion}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Codename (Optional)</label>
          <Input
            placeholder="e.g. Aurora"
            value={codename}
            onChange={(e) => setCodename(e.target.value)}
          />
        </div>

        <div className={styles.manualOverrideSection}>
          <button 
            className={styles.overrideToggle} 
            onClick={() => setShowManualOverride(!showManualOverride)}
            type="button"
          >
            {showManualOverride ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Manual Version Override
          </button>
          
          {showManualOverride && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Version Number</label>
              <Input
                placeholder="e.g. 2.0.0"
                value={manualVersion}
                onChange={(e) => setManualVersion(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreateDisabled}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
