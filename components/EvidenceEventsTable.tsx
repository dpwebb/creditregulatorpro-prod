import { useState } from "react";
import { format } from "../helpers/dateUtils";
import { 
  Clock, 
  Edit2, 
  ShieldCheck, 
  FileText, 
  Trash2 
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { Input } from "./Input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "./Table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger 
} from "./Dialog";
import { BulkSelectAllCheckbox, BulkRowCheckbox } from "./BulkActionsToolbar";
import { EvidenceEventWithDetails, useUpdateEvidenceEvent, useDeleteEvidenceEvent } from "../helpers/evidenceQueries";
import { EvidenceEventViewDialog } from "./EvidenceEventViewDialog";
import styles from "./EvidenceEventsTable.module.css";

interface EvidenceEventsTableProps {
  data: { events: EvidenceEventWithDetails[] } | undefined;
  isFetching: boolean;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onCreateOpen: () => void;
}

export const EvidenceEventsTable = ({
  data,
  isFetching,
  selectedIds,
  onSelectionChange,
  onCreateOpen,
}: EvidenceEventsTableProps) => {
  const allIds = data?.events.map((e) => e.id) || [];

  return (
    <>
    <TableContainer className={styles.desktopOnly}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead style={{ width: "40px" }}>
              <BulkSelectAllCheckbox
                selectedIds={selectedIds}
                allIds={allIds}
                onSelectionChange={onSelectionChange}
                disabled={isFetching || !data?.events.length}
              />
            </TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Event Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Packet</TableHead>
            <TableHead>Tradeline</TableHead>
            <TableHead>Statute</TableHead>
            <TableHead>Timestamp</TableHead>
            <TableHead>Hash Chain</TableHead>
            <TableHead style={{ width: "80px", textAlign: "right" }}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isFetching ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className={styles.skeletonCheckbox} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonCell} /></TableCell>
                <TableCell><Skeleton className={styles.skeletonIcon} /></TableCell>
              </TableRow>
            ))
          ) : data?.events && data.events.length > 0 ? (
            data.events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <BulkRowCheckbox
                    id={event.id}
                    selectedIds={selectedIds}
                    onSelectionChange={onSelectionChange}
                  />
                </TableCell>
                <TableCell>
                  <span className={styles.idText}>#{event.id}</span>
                </TableCell>
                <TableCell>
                  <EditableTextCell 
                    id={event.id} 
                    value={event.eventType} 
                    field="eventType"
                  />
                </TableCell>
                <TableCell>
                  <EditableTextCell 
                    id={event.id} 
                    value={event.description || ""} 
                    field="description"
                  />
                </TableCell>
                <TableCell>
                  {event.packetId ? (
                    <div className={styles.packetCell}>
                      <span className={styles.packetId}>#{event.packetId}</span>
                      {event.packetStatus && (
                        <Badge variant="info" className={styles.miniBadge}>{event.packetStatus}</Badge>
                      )}
                    </div>
                  ) : (
                    <span className={styles.mutedText}>—</span>
                  )}
                </TableCell>
                <TableCell>
                  {event.tradelineAccountNumber ? (
                    <span className={styles.accountNumber}>{event.tradelineAccountNumber}</span>
                  ) : (
                    <span className={styles.mutedText}>—</span>
                  )}
                </TableCell>
                <TableCell>
                  {/* @ts-ignore - fixing statuteId vs statuteVersionId mismatch based on project context/error logs */}
                  {event.statuteVersionId ? (
                    <span className={styles.statuteId}>§{event.statuteVersionId}</span>
                  ) : (
                    <span className={styles.mutedText}>—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className={styles.dateCell}>
                    <Clock size={12} className={styles.dateIcon} />
                    {event.at ? format(new Date(event.at), "yyyy-MM-dd HH:mm") : "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className={styles.hashCell}>
                    {event.currentHash ? (
                      <div className={styles.hashIndicator} title={`Current: ${event.currentHash}\nPrevious: ${event.previousHash || 'None'}`}>
                        <ShieldCheck size={14} className={styles.hashIcon} />
                        <span className={styles.hashText}>Secured</span>
                      </div>
                    ) : (
                      <span className={styles.mutedText}>Unsigned</span>
                    )}
                  </div>
                </TableCell>
                <TableCell style={{ textAlign: "right" }}>
                  <div className={styles.actionsCell}>
                    <EvidenceEventViewDialog event={event} />
                    <DeleteEventButton id={event.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={10}>
                <div className={styles.emptyState}>
                  <FileText size={40} />
                  <h3>No Communications</h3>
                  <p>Create a new communication to start tracking.</p>
                  <Button variant="default" size="sm" onClick={onCreateOpen}>
                    Add Communication
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>

    <div className={`${styles.mobileOnly} ${styles.mobileListContainer}`}>
      {isFetching ? (
        <div className={styles.mobileCardList}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={styles.skeletonMobileCard} />
          ))}
        </div>
      ) : data?.events && data.events.length > 0 ? (
        <div className={styles.mobileCardList}>
          {data.events.map((event) => (
            <div key={event.id} className={styles.mobileCard}>
              <div className={styles.mobileCardTop}>
                <div className={styles.mobileCardTitleRow}>
                  <BulkRowCheckbox
                    id={event.id}
                    selectedIds={selectedIds}
                    onSelectionChange={onSelectionChange}
                  />
                  <EditableTextCell 
                    id={event.id} 
                    value={event.eventType} 
                    field="eventType"
                  />
                  {event.currentHash && (
                    <div className={styles.hashIndicator} title="Secured">
                      <ShieldCheck size={14} className={styles.hashIcon} />
                    </div>
                  )}
                </div>
                <span className={styles.idText}>#{event.id}</span>
              </div>

              <div style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>
                <EditableTextCell 
                  id={event.id} 
                  value={event.description || "No description"} 
                  field="description"
                />
              </div>

              <div className={styles.mobileCardMiddle}>
                <div className={styles.mobileCardDetail}>
                  <span className={styles.mobileCardLabel}>Packet</span>
                  {event.packetId ? (
                    <div className={styles.packetCell}>
                      <span className={styles.packetId}>#{event.packetId}</span>
                      {event.packetStatus && (
                        <Badge variant="info" className={styles.miniBadge}>{event.packetStatus}</Badge>
                      )}
                    </div>
                  ) : (
                    <span className={styles.mutedText}>—</span>
                  )}
                </div>
                <div className={styles.mobileCardDetail}>
                  <span className={styles.mobileCardLabel}>Tradeline</span>
                  {event.tradelineAccountNumber ? (
                    <span className={styles.accountNumber}>{event.tradelineAccountNumber}</span>
                  ) : (
                    <span className={styles.mutedText}>—</span>
                  )}
                </div>
              </div>

              <div className={styles.mobileCardBottom}>
                <div className={styles.dateCell}>
                  <Clock size={12} className={styles.dateIcon} />
                  {event.at ? format(new Date(event.at), "yyyy-MM-dd HH:mm") : "—"}
                </div>
                <div className={styles.actionsCell}>
                  <EvidenceEventViewDialog event={event} />
                  <DeleteEventButton id={event.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <FileText size={40} />
          <h3>No Communications</h3>
          <p>Create a new communication to start tracking.</p>
          <Button variant="default" size="sm" onClick={onCreateOpen}>
            Add Communication
          </Button>
        </div>
      )}
    </div>
    </>
  );
};

function EditableTextCell({ id, value, field }: { id: number, value: string, field: "eventType" | "description" }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const { mutate: updateEvent } = useUpdateEvidenceEvent();

  const handleSave = () => {
    if (tempValue !== value) {
      updateEvent({ id, [field]: tempValue }, {
        onSuccess: () => toast.success("Updated successfully"),
        onError: () => {
          toast.error("Failed to update");
          setTempValue(value);
        }
      });
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Input 
        autoFocus
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') {
            setTempValue(value);
            setIsEditing(false);
          }
        }}
        className={styles.inlineInput}
      />
    );
  }

  return (
    <div className={styles.editableCell} onClick={() => setIsEditing(true)} title="Click to edit">
      <span className={styles.cellValue}>{value}</span>
      <Edit2 size={12} className={styles.editIcon} />
    </div>
  );
}

function DeleteEventButton({ id }: { id: number }) {
  const { mutate: deleteEvent, isPending } = useDeleteEvidenceEvent();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    deleteEvent({ id }, {
      onSuccess: () => {
        toast.success("Communication deleted");
        setIsOpen(false);
      },
      onError: () => {
        toast.error("Failed to delete communication");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={styles.deleteBtn}>
          <Trash2 size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Deletion</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this communication? This action cannot be undone and may break the evidence chain.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button variant="error" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete Communication"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}