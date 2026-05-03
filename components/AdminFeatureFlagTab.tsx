import React, { useState } from "react";
import {
  useFeatureFlags,
  useCreateFeatureFlag,
  useUpdateFeatureFlag,
  useDeleteFeatureFlag,
} from "../helpers/featureFlagQueries";
import { useToast } from "../helpers/useToast";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { Switch } from "./Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "./Dialog";
import { Input } from "./Input";
import { Edit, Trash2, Plus } from "lucide-react";
import styles from "./AdminFeatureFlagTab.module.css";

interface FlagItem {
  id: number;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  minVersion: string | null;
  maxVersion: string | null;
  scope: "global" | "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

export const AdminFeatureFlagTab = () => {
  const { data: rawFlags, isLoading } = useFeatureFlags();
  const flags = rawFlags as unknown as FlagItem[];
  const createMutation = useCreateFeatureFlag();
  const updateMutation = useUpdateFeatureFlag();
  const deleteMutation = useDeleteFeatureFlag();
  const { showSuccess, showError } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    key: string;
    label: string;
    description: string;
    scope: "admin" | "global" | "user";
    enabled: boolean;
    minVersion: string;
    maxVersion: string;
  }>({
    key: "",
    label: "",
    description: "",
    scope: "global",
    enabled: false,
    minVersion: "",
    maxVersion: "",
  });

  const [editingFlag, setEditingFlag] = useState<FlagItem | null>(null);

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        key: createForm.key,
        label: createForm.label,
        description: createForm.description || null,
        scope: createForm.scope,
        enabled: createForm.enabled,
        minVersion: createForm.minVersion || null,
        maxVersion: createForm.maxVersion || null,
      });
      showSuccess("Feature flag created");
      setIsCreateOpen(false);
      setCreateForm({
        key: "",
        label: "",
        description: "",
        scope: "global",
        enabled: false,
        minVersion: "",
        maxVersion: "",
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create flag");
    }
  };

  const handleUpdate = async () => {
    if (!editingFlag) return;
    try {
      await updateMutation.mutateAsync({
        id: editingFlag.id as number,
        label: editingFlag.label,
        description: editingFlag.description || null,
        scope: editingFlag.scope,
        minVersion: editingFlag.minVersion || null,
        maxVersion: editingFlag.maxVersion || null,
      });
      showSuccess("Feature flag updated");
      setEditingFlag(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update flag");
    }
  };

  const handleToggle = async (flag: FlagItem, checked: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id: flag.id as number,
        enabled: checked,
      });
      showSuccess(`Flag ${flag.key} ${checked ? "enabled" : "disabled"}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to toggle flag");
    }
  };

  const handleDelete = async (flag: FlagItem) => {
    if (!window.confirm(`Are you sure you want to delete flag ${flag.key}?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: flag.id as number });
      showSuccess("Feature flag deleted");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete flag");
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.headerRow}>
        <div className={styles.titleArea}>
          <h2 className={styles.sectionTitle}>Feature Flags</h2>
          <p className={styles.subtitle}>Toggle features dynamically without code deployments.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus size={16} /> Add Flag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Feature Flag</DialogTitle>
            </DialogHeader>
            <div className={styles.formGroup}>
              <label className={styles.label}>Key (unique identifier)</label>
              <Input
                placeholder="e.g. enable_new_dashboard"
                value={createForm.key}
                onChange={(e) => setCreateForm({ ...createForm, key: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Label (display name)</label>
              <Input
                placeholder="e.g. New Dashboard UI"
                value={createForm.label}
                onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <Input
                placeholder="Brief description"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              />
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Scope</label>
                <Select
                  value={createForm.scope}
                  onValueChange={(v: "admin" | "global" | "user") =>
                    setCreateForm({ ...createForm, scope: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="admin">Admin Only</SelectItem>
                    <SelectItem value="user">User Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.formGroupToggle}>
                <label className={styles.label}>Enabled Initial State</label>
                <Switch
                  checked={createForm.enabled}
                  onCheckedChange={(c) => setCreateForm({ ...createForm, enabled: c })}
                />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Min Version (Optional)</label>
                <Input
                  placeholder="e.g. 1.0.0"
                  value={createForm.minVersion}
                  onChange={(e) => setCreateForm({ ...createForm, minVersion: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Max Version (Optional)</label>
                <Input
                  placeholder="e.g. 2.0.0"
                  value={createForm.maxVersion}
                  onChange={(e) => setCreateForm({ ...createForm, maxVersion: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !createForm.key}>
                Create Flag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key / Label</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className={styles.hideMobile}>Version Range</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                  <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                </TableCell>
              </TableRow>
            ) : !flags || flags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className={styles.emptyState}>
                  No feature flags configured.
                </TableCell>
              </TableRow>
            ) : (
              flags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell>
                    <div className={styles.flagInfo}>
                      <span className={styles.flagKey}>{flag.key}</span>
                      <span className={styles.flagLabel}>{flag.label}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={(c) => handleToggle(flag, c)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className={styles.scopeBadge}>
                      {flag.scope}
                    </Badge>
                  </TableCell>
                  <TableCell className={styles.hideMobile}>
                    <div className={styles.versionRange}>
                      {flag.minVersion ? `>= ${flag.minVersion}` : "Any"}
                      {" - "}
                      {flag.maxVersion ? `<= ${flag.maxVersion}` : "Any"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingFlag(flag)}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={styles.dangerBtn}
                        onClick={() => handleDelete(flag)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!editingFlag} onOpenChange={(o) => !o && setEditingFlag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Feature Flag</DialogTitle>
          </DialogHeader>
          {editingFlag && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.label}>Key (cannot be changed)</label>
                <Input value={editingFlag.key} disabled />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Label</label>
                <Input
                  value={editingFlag.label}
                  onChange={(e) => setEditingFlag({ ...editingFlag, label: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Description</label>
                <Input
                  value={editingFlag.description || ""}
                  onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Scope</label>
                <Select
                  value={editingFlag.scope}
                  onValueChange={(v: "admin" | "global" | "user") =>
                    setEditingFlag({ ...editingFlag, scope: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="admin">Admin Only</SelectItem>
                    <SelectItem value="user">User Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Min Version</label>
                  <Input
                    value={editingFlag.minVersion || ""}
                    onChange={(e) => setEditingFlag({ ...editingFlag, minVersion: e.target.value })}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Max Version</label>
                  <Input
                    value={editingFlag.maxVersion || ""}
                    onChange={(e) => setEditingFlag({ ...editingFlag, maxVersion: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditingFlag(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
