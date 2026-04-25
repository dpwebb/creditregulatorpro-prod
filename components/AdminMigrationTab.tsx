import React, { useState } from "react";
import {
  useVersions,
  useVersionMigrations,
  useCreateMigration,
  useUpdateMigration,
} from "../helpers/versionQueries";
import { useToast } from "../helpers/useToast";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
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
import { Textarea } from "./Textarea";
import { DatabaseZap, RotateCcw, Plus } from "lucide-react";
import styles from "./AdminMigrationTab.module.css";

interface MigrationItem {
  id: number;
  versionId: number;
  name: string;
  description: string | null;
  status: "pending" | "applied" | "rolled_back";
  sqlUp: string | null;
  sqlDown: string | null;
  appliedAt: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const AdminMigrationTab = () => {
  const { data: versions, isLoading: isVersionsLoading } = useVersions();
  const [selectedVersionId, setSelectedVersionId] = useState<string>("_empty");

  const actualVersionId = selectedVersionId === "_empty" ? 0 : parseInt(selectedVersionId, 10);

  const { data: rawMigrations, isLoading: isMigrationsLoading } = useVersionMigrations(actualVersionId);
  const migrations = rawMigrations as unknown as MigrationItem[];

  const createMutation = useCreateMigration();
  const updateMutation = useUpdateMigration();
  const { showSuccess, showError } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    sqlUp: "",
    sqlDown: "",
  });

  const handleCreate = async () => {
    if (actualVersionId === 0) return;
    try {
      await createMutation.mutateAsync({
        versionId: actualVersionId,
        name: createForm.name,
        description: createForm.description || null,
        sqlUp: createForm.sqlUp || null,
        sqlDown: createForm.sqlDown || null,
      });
      showSuccess("Migration created successfully");
      setIsCreateOpen(false);
      setCreateForm({ name: "", description: "", sqlUp: "", sqlDown: "" });
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create migration");
    }
  };

  const handleStatusChange = async (migration: MigrationItem, newStatus: "applied" | "rolled_back") => {
    try {
      await updateMutation.mutateAsync({
        id: migration.id as number,
        status: newStatus,
      });
      showSuccess(`Migration ${newStatus.replace("_", " ")} successfully`);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update migration");
    }
  };

  const renderBadge = (status: string) => {
    switch (status) {
      case "applied":
        return <Badge variant="success">Applied</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      case "rolled_back":
        return <Badge variant="error">Rolled Back</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.toolbar}>
        <div className={styles.selectorGroup}>
          <label className={styles.selectLabel}>Target Version:</label>
          <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
            <SelectTrigger className={styles.versionSelect}>
              <SelectValue placeholder="Select a version..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_empty">-- Select a version --</SelectItem>
              {versions?.map((v) => (
                <SelectItem key={v.id} value={v.id.toString()}>
                  v{v.version} {v.codename ? `(${v.codename})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {actualVersionId !== 0 && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={16} /> Add Migration
              </Button>
            </DialogTrigger>
            <DialogContent className={styles.dialogWide}>
              <DialogHeader>
                <DialogTitle>Add Migration</DialogTitle>
              </DialogHeader>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Name</label>
                  <Input
                    placeholder="e.g. create_users_table"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
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
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>SQL Up</label>
                  <Textarea
                    className={styles.sqlInput}
                    placeholder="CREATE TABLE..."
                    value={createForm.sqlUp}
                    onChange={(e) => setCreateForm({ ...createForm, sqlUp: e.target.value })}
                  />
                </div>
                <div className={styles.formGroupFull}>
                  <label className={styles.label}>SQL Down</label>
                  <Textarea
                    className={styles.sqlInput}
                    placeholder="DROP TABLE..."
                    value={createForm.sqlDown}
                    onChange={(e) => setCreateForm({ ...createForm, sqlDown: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending || !createForm.name}>
                  Create Migration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Applied At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isVersionsLoading || isMigrationsLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                  <Skeleton style={{ height: "40px", margin: "var(--spacing-2) 0" }} />
                </TableCell>
              </TableRow>
            ) : actualVersionId === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className={styles.emptyState}>
                  Select a version to view migrations.
                </TableCell>
              </TableRow>
            ) : !migrations || migrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className={styles.emptyState}>
                  No migrations found for this version.
                </TableCell>
              </TableRow>
            ) : (
              migrations.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className={styles.monoCell}>{m.name}</TableCell>
                  <TableCell>{m.description || "—"}</TableCell>
                  <TableCell>{renderBadge(m.status)}</TableCell>
                  <TableCell>
                    {m.appliedAt ? dateFormatter.format(new Date(m.appliedAt)) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      {(m.status === "pending" || m.status === "rolled_back") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m, "applied")}
                        >
                          <DatabaseZap size={14} /> Apply
                        </Button>
                      )}
                      {m.status === "applied" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m, "rolled_back")}
                        >
                          <RotateCcw size={14} /> Roll Back
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};