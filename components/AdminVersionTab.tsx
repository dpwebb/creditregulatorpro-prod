import React, { useState } from "react";
import {
  useVersions,
  useCurrentVersion,
  useUpdateVersion,
  useDeleteVersion,
  useGenerateSnapshot,
  useGenerateNotes,
} from "../helpers/versionQueries";
import { useToast } from "../helpers/useToast";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  } from "./Dialog";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { AdminVersionNotesEditor } from "./AdminVersionNotesEditor";
import { PublishChecklistDialog } from "./PublishChecklistDialog";
import { AdminVersionCreateDialog } from "./AdminVersionCreateDialog";

import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import {
  Lock,
  Unlock,
  Archive,
  Play,
  Rocket,
  Edit,
  Trash2,
  Camera,
  Star,
  Info,
    Sparkles,
} from "lucide-react";
import styles from "./AdminVersionTab.module.css";

export interface VersionItem {
  id: number;
  version: string;
  codename: string | null;
  status: "draft" | "staged" | "released" | "archived";
  locked: boolean;
  releaseNotes: any;
  systemSnapshot: any;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: number | null;
  codeLineCount?: number | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const AdminVersionTab = () => {
  const { data: rawVersions, isLoading: isVersionsLoading } = useVersions();
  const { data: rawCurrentVersion, isLoading: isCurrentLoading } = useCurrentVersion();
  
  const versions = rawVersions as unknown as VersionItem[];
  const currentVersion = rawCurrentVersion as unknown as VersionItem;

  const updateMutation = useUpdateVersion();
  const deleteMutation = useDeleteVersion();
  const snapshotMutation = useGenerateSnapshot();
  const generateNotesMutation = useGenerateNotes();

  const { showSuccess, showError } = useToast();

  const [editingVersion, setEditingVersion] = useState<VersionItem | null>(null);
  const [releaseCandidate, setReleaseCandidate] = useState<VersionItem | null>(null);
  const [editForm, setEditForm] = useState<{
    codename: string;
    releaseNotesRaw: string;
  }>({ codename: "", releaseNotesRaw: "" });

  const handleOpenEdit = (v: VersionItem) => {
    setEditingVersion(v);
    let rawNotes = "";
    if (v.releaseNotes) {
      try {
        rawNotes = JSON.stringify(v.releaseNotes, null, 2);
      } catch (e) {
        rawNotes = "";
      }
    }
    setEditForm({ codename: v.codename || "", releaseNotesRaw: rawNotes });
  };

  const handleUpdate = async () => {
    if (!editingVersion) return;
    try {
      let parsedNotes = undefined;
      if (editForm.releaseNotesRaw.trim()) {
        parsedNotes = JSON.parse(editForm.releaseNotesRaw);
      }

      await updateMutation.mutateAsync({
        id: editingVersion.id as number,
        codename: editForm.codename || null,
        releaseNotes: parsedNotes,
      });
      showSuccess("Version updated successfully");
      setEditingVersion(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update version. Check JSON format.");
    }
  };

  const handleStatusChange = async (v: VersionItem, newStatus: "draft" | "staged" | "released" | "archived") => {
    try {
      await updateMutation.mutateAsync({ id: v.id as number, status: newStatus });
      showSuccess(`Version marked as ${newStatus}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleLockToggle = async (v: VersionItem) => {
    try {
      await updateMutation.mutateAsync({ id: v.id as number, locked: !v.locked });
      showSuccess(`Version ${v.locked ? "unlocked" : "locked"}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to toggle lock");
    }
  };

  const handleDelete = async (v: VersionItem) => {
    if (v.locked) {
      showError("Cannot delete a locked version");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete version ${v.version}?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: v.id as number });
      showSuccess("Version deleted successfully");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete version");
    }
  };

  const handleSnapshot = async (v: VersionItem) => {
    try {
      await snapshotMutation.mutateAsync({ versionId: v.id as number });
      showSuccess("Snapshot generated successfully");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to generate snapshot");
    }
  };

  const handleGenerateNotes = async (v: VersionItem) => {
    try {
      await generateNotesMutation.mutateAsync({ versionId: v.id as number });
      showSuccess("Release notes generated");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to generate notes");
    }
  };

  const renderBadge = (status: string) => {
    switch (status) {
      case "released":
        return <Badge variant="success">Released</Badge>;
      case "staged":
        return <Badge variant="warning">Staged</Badge>;
      case "archived":
        return <Badge variant="default">Archived</Badge>;
      default:
        return <Badge variant="info">Draft</Badge>;
    }
  };

  if (isVersionsLoading || isCurrentLoading) {
    return (
      <div className={styles.loaderContainer}>
        <Skeleton style={{ height: "160px" }} />
        <Skeleton style={{ height: "120px" }} />
        <Skeleton style={{ height: "120px" }} />
      </div>
    );
  }

  // Ensure current version is excluded from standard list to prevent duplication
  const otherVersions = versions?.filter((v) => v.id !== currentVersion?.id) || [];

  const renderChecklist = (v: VersionItem) => {
    if (v.status !== "draft" && v.status !== "staged") return null;

    const hasNotes = Array.isArray(v.releaseNotes) && v.releaseNotes.length > 0;
    const hasSnapshot = !!v.systemSnapshot;
        const isStaged = v.status === "staged";
    const isReleased = false; // checklist only renders for draft/staged
    const prerequisitesMet = hasNotes && hasSnapshot;

    return (
      <div className={styles.checklistSection}>
        <div className={styles.checklistHint}>Complete all steps to release this version</div>
        <div className={styles.stepper}>
          <div className={`${styles.step} ${styles.stepDone}`}>
            <div className={styles.stepIcon}>✓</div>
            <div className={styles.stepLabel}>Version created</div>
          </div>
          <div className={`${styles.step} ${hasNotes ? styles.stepDone : ""}`}>
            <div className={styles.stepIcon}>{hasNotes ? "✓" : "2"}</div>
            <div className={styles.stepLabel}>Release notes added</div>
            {!hasNotes && v.status === "draft" && !v.locked && (
              <Button
                size="sm"
                variant="outline"
                className={styles.inlineBtn}
                onClick={() => handleGenerateNotes(v)}
                disabled={generateNotesMutation.isPending}
              >
                Generate Notes
              </Button>
            )}
          </div>
          <div className={`${styles.step} ${hasSnapshot ? styles.stepDone : ""}`}>
            <div className={styles.stepIcon}>{hasSnapshot ? "✓" : "3"}</div>
            <div className={styles.stepLabel}>Snapshot generated</div>
            {!hasSnapshot && v.status === "draft" && !v.locked && (
              <Button
                size="sm"
                variant="outline"
                className={styles.inlineBtn}
                onClick={() => handleSnapshot(v)}
                disabled={snapshotMutation.isPending}
              >
                Generate Snapshot
              </Button>
            )}
          </div>
          <div className={`${styles.step} ${isStaged ? styles.stepDone : ""}`}>
            <div className={styles.stepIcon}>{isStaged ? "✓" : "4"}</div>
            <div className={styles.stepLabel}>Staged for review</div>
            {!isStaged && v.status === "draft" && !v.locked && prerequisitesMet && (
              <Button
                size="sm"
                variant="secondary"
                className={styles.inlineBtn}
                onClick={() => handleStatusChange(v, "staged")}
                disabled={updateMutation.isPending}
              >
                Stage
              </Button>
            )}
          </div>
          <div className={`${styles.step} ${isReleased ? styles.stepDone : ""}`}>
            <div className={styles.stepIcon}>{isReleased ? "✓" : "5"}</div>
            <div className={styles.stepLabel}>Released</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.headerRow}>
        <h2 className={styles.sectionTitle}>System Releases</h2>
        <AdminVersionCreateDialog />
      </div>

      {currentVersion && (
        <div className={`${styles.versionCard} ${styles.heroCard}`}>
          <div className={styles.heroGlow} />
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleRow}>
              <Star className={styles.heroIcon} size={24} />
              <h3 className={styles.versionName}>
                v{currentVersion.version}
                {currentVersion.codename && (
                  <span className={styles.codename}> "{currentVersion.codename}"</span>
                )}
              </h3>
              {renderBadge(currentVersion.status)}
              {currentVersion.locked && <Lock size={16} className={styles.lockIcon} />}
            </div>
            <div className={styles.cardActions}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(currentVersion)}>
                    <Edit size={14} /> Edit
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit version details & notes</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => handleSnapshot(currentVersion)}>
                    <Camera size={14} /> Snapshot
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Capture System Snapshot</TooltipContent>
              </Tooltip>
              
              {!currentVersion.locked && (currentVersion.status === "draft" || currentVersion.status === "staged") && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleGenerateNotes(currentVersion)}
                        disabled={generateNotesMutation.isPending && generateNotesMutation.variables?.versionId === currentVersion.id}
                      >
                        <Sparkles size={14} />
                        {generateNotesMutation.isPending && generateNotesMutation.variables?.versionId === currentVersion.id ? "Generating..." : "Generate Notes"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate AI Release Notes</TooltipContent>
                  </Tooltip>
                </>
              )}

              {!currentVersion.locked && currentVersion.status === "staged" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="primary" onClick={() => setReleaseCandidate(currentVersion)}>
                      <Rocket size={14} /> Release
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Release to production</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <div className={styles.metaRow}>
            <span>Created: {dateFormatter.format(new Date(currentVersion.createdAt))}</span>
            {currentVersion.releasedAt && (
              <span>Released: {dateFormatter.format(new Date(currentVersion.releasedAt))}</span>
            )}
            {currentVersion.codeLineCount != null && (
              <span>Lines of Code: {currentVersion.codeLineCount.toLocaleString()}</span>
            )}
          </div>

          {renderChecklist(currentVersion)}

          {currentVersion.releaseNotes && (
            <div className={styles.releaseNotes}>
              <h4 className={styles.subTitle}>Release Notes</h4>
              {(currentVersion.releaseNotes as Array<any>)?.map((note, idx) => (
                <div key={idx} className={styles.noteGroup}>
                  <strong>{note.category}</strong>
                  <ul>
                    {note.items?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.versionsGrid}>
        {otherVersions.map((v) => (
          <div key={v.id} className={styles.versionCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.versionName}>
                  v{v.version}
                  {v.codename && <span className={styles.codename}> "{v.codename}"</span>}
                </h3>
                {renderBadge(v.status)}
                {v.locked && <Lock size={16} className={styles.lockIcon} />}
              </div>
            </div>

            <div className={styles.metaRow}>
              <span>Created: {dateFormatter.format(new Date(v.createdAt))}</span>
            </div>

            {renderChecklist(v)}

            <div className={styles.cardFooter}>
              <div className={styles.actionGroup}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-sm" variant="ghost" onClick={() => handleOpenEdit(v)}>
                      <Edit size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit version details & notes</TooltipContent>
                </Tooltip>

                {!v.locked && (v.status === "draft" || v.status === "staged") && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size={generateNotesMutation.isPending && generateNotesMutation.variables?.versionId === v.id ? "sm" : "icon-sm"} 
                          variant="ghost" 
                          onClick={() => handleGenerateNotes(v)} 
                          disabled={generateNotesMutation.isPending && generateNotesMutation.variables?.versionId === v.id}
                        >
                          <Sparkles size={16} />
                          {generateNotesMutation.isPending && generateNotesMutation.variables?.versionId === v.id && "..."}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Generate AI Release Notes</TooltipContent>
                    </Tooltip>
                  </>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon-sm" variant="ghost" onClick={() => handleSnapshot(v)}>
                      <Camera size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Capture System Snapshot</TooltipContent>
                </Tooltip>
              </div>

              <div className={styles.actionGroup}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleLockToggle(v)}
                    >
                      {v.locked ? <Unlock size={16} /> : <Lock size={16} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{v.locked ? "Unlock version" : "Lock: Prevent content changes"}</TooltipContent>
                </Tooltip>

                {!v.locked && v.status === "draft" && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="secondary" onClick={() => handleStatusChange(v, "staged")} disabled={!(Array.isArray(v.releaseNotes) && v.releaseNotes.length > 0 && !!v.systemSnapshot)}>
                          <Play size={14} /> Stage
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Stage: Freeze for final review before release</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon-sm" variant="ghost" className={styles.dangerBtn} onClick={() => handleDelete(v)}>
                          <Trash2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete draft version</TooltipContent>
                    </Tooltip>
                  </>
                )}

                {!v.locked && v.status === "staged" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="primary" onClick={() => setReleaseCandidate(v)}>
                        <Rocket size={14} /> Release
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Release to production</TooltipContent>
                  </Tooltip>
                )}

                {!v.locked && v.status === "released" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => handleStatusChange(v, "archived")}>
                        <Archive size={14} /> Archive
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Archive this version</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {v.systemSnapshot && (
              <div className={styles.snapshotSection}>
                <div className={styles.snapshotTitle}>
                  <Info size={14} /> System Snapshot
                </div>
                <div className={styles.snapshotGrid}>
                  {Object.entries(v.systemSnapshot as Record<string, any>).slice(0, 4).map(([key, val]) => (
                    <div key={key} className={styles.snapshotItem}>
                      <span className={styles.snapshotKey}>{key}</span>
                      <span className={styles.snapshotVal}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!editingVersion} onOpenChange={(o) => !o && setEditingVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Version {editingVersion?.version}</DialogTitle>
          </DialogHeader>
          <div className={styles.formGroup}>
            <label className={styles.label}>Codename</label>
            <Input
              value={editForm.codename}
              onChange={(e) => setEditForm({ ...editForm, codename: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <AdminVersionNotesEditor
              releaseNotesRaw={editForm.releaseNotesRaw}
              onChange={(val) => setEditForm({ ...editForm, releaseNotesRaw: val })}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingVersion(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {releaseCandidate && (
        <PublishChecklistDialog
          versionId={releaseCandidate.id}
          versionName={releaseCandidate.version}
          open={!!releaseCandidate}
          onOpenChange={(open) => {
            if (!open) setReleaseCandidate(null);
          }}
          onConfirmRelease={() => {
            handleStatusChange(releaseCandidate, "released");
            setReleaseCandidate(null);
          }}
        />
      )}
    </div>
  );
};