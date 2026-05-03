import { useState } from "react";
import { Selectable } from "kysely";
import { Edit2 } from "lucide-react";
import { ParserFieldMapping } from "../helpers/schema";
import { DefaultMappingEntry } from "../helpers/parserMappingDefaults";
import {
  useParserMappings,
  useUpdateParserMapping,
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
import { Switch } from "./Switch";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { ParserMappingEditor } from "./ParserMappingEditor";
import styles from "./ParserMappingTable.module.css";

const BUREAUS = ["All", "TransUnion", "Equifax"];
const SECTIONS = [
  "All",
  "tradeline",
  "consumer_info",
  "inquiry",
  "public_record",
  "employment",
  "metadata",
];

export const ParserMappingTable = () => {
  const [bureauFilter, setBureauFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<
    Selectable<ParserFieldMapping> | null
  >(null);

  const { data, isLoading, isError } = useParserMappings(
    bureauFilter === "All" ? undefined : bureauFilter,
    sectionFilter === "All" ? undefined : sectionFilter
  );

  const updateMapping = useUpdateParserMapping();
  const { showSuccess, showError } = useToast();

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      await updateMapping.mutateAsync({ id, isActive: !currentActive });
      showSuccess("Mapping status updated");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to update mapping"
      );
    }
  };

  const handleEdit = (mapping: Selectable<ParserFieldMapping>) => {
    setEditingMapping(mapping);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingMapping(null);
    setEditorOpen(true);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Bureau</label>
            <Select value={bureauFilter} onValueChange={setBureauFilter}>
              <SelectTrigger className={styles.filterTrigger}>
                <SelectValue placeholder="All Bureaus" />
              </SelectTrigger>
              <SelectContent>
                {BUREAUS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Section</label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className={styles.filterTrigger}>
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? s : s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleCreate}>Add Override</Button>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Bureau</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Source Path</TableHead>
              <TableHead>Target Field</TableHead>
              <TableHead>Transform</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={styles.actionHead}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                  <TableCell>
                    <Skeleton className={styles.skeletonCell} />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className={styles.emptyState}>
                  <p>Failed to load mappings.</p>
                </TableCell>
              </TableRow>
            ) : (data?.mappings.length === 0 && data?.defaults.length === 0) ? (
              <TableRow>
                <TableCell colSpan={9} className={styles.emptyState}>
                  <p>No mappings found for the selected filters.</p>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Render Custom Overrides first */}
                {data?.mappings.map((mapping) => (
                  <TableRow key={`custom-${mapping.id}`}>
                    <TableCell>
                      <Badge variant="primary">Override</Badge>
                    </TableCell>
                    <TableCell>{mapping.bureau}</TableCell>
                    <TableCell className={styles.monoCell}>
                      {mapping.section}
                    </TableCell>
                    <TableCell className={styles.monoCell}>
                      {mapping.sourcePath}
                    </TableCell>
                    <TableCell className={styles.monoCell}>
                      {mapping.targetField}
                    </TableCell>
                    <TableCell>{mapping.transformType}</TableCell>
                    <TableCell>{mapping.priority}</TableCell>
                    <TableCell>
                      <div className={styles.switchWrapper}>
                        <Switch
                          checked={mapping.isActive}
                          onCheckedChange={() =>
                            handleToggleActive(mapping.id, mapping.isActive)
                          }
                          disabled={updateMapping.isPending}
                        />
                      </div>
                    </TableCell>
                    <TableCell className={styles.actionCell}>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(mapping)}
                        aria-label="Edit Override"
                      >
                        <Edit2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Render Defaults */}
                {data?.defaults.map((def: DefaultMappingEntry, idx: number) => (
                  <TableRow
                    key={`default-${def.bureau}-${def.section}-${def.sourcePath}-${idx}`}
                    className={styles.defaultRow}
                  >
                    <TableCell>
                      <Badge variant="default">Default</Badge>
                    </TableCell>
                    <TableCell>{def.bureau}</TableCell>
                    <TableCell className={styles.monoCell}>
                      {def.section}
                    </TableCell>
                    <TableCell className={styles.monoCell}>
                      {def.sourcePath}
                    </TableCell>
                    <TableCell className={styles.monoCell}>
                      {def.targetField}
                    </TableCell>
                    <TableCell>{def.transformType}</TableCell>
                    <TableCell className={styles.mutedText}>—</TableCell>
                    <TableCell>
                      <Badge variant="success">Active</Badge>
                    </TableCell>
                    <TableCell className={styles.actionCell}>
                      {/* Defaults cannot be edited directly, you create an override instead */}
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ParserMappingEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        mapping={editingMapping}
      />
    </div>
  );
};