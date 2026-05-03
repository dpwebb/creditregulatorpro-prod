import { useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import { z } from "zod";
import { useReportArtifactList, useCreateReportArtifact, useDeleteReportArtifact } from "../helpers/reportArtifactQueries";
import { useTradelineList } from "../helpers/tradelineQueries";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "../components/Dialog";
import { Form, FormItem, FormLabel, FormControl, FormMessage, useForm } from "../components/Form";
import { Input } from "../components/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";
import { BureauBadge } from "../components/BureauBadge";

import { Popover, PopoverContent, PopoverTrigger } from "../components/Popover";
import { Calendar } from "../components/Calendar";
import { Plus, Trash2, FileText, Calendar as CalendarIcon, Link as LinkIcon, AlertCircle, CheckCircle, Clock, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format, isPast, addDays, isBefore } from "../helpers/dateUtils";
import { humanizeLabels } from "../helpers/humanizeLabels";
import styles from "./report-artifacts.module.css";

const createArtifactSchema = z.object({
  tradelineId: z.string().transform((val) => {
    const num = Number(val);
    return num > 0 ? num : null;
  }),
  reportDate: z.date({ required_error: "Report date is required" }),
  artifactType: z.string().min(1, "Artifact type is required"),
  expiresAt: z.date().optional(),
});

export default function ReportArtifactsPage() {
  
  const { data, isFetching, error } = useReportArtifactList();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (error) {
    return <div className={styles.error}>Error loading report artifacts. Please try again.</div>;
  }

  const getExpirationStatus = (expiresAt: Date | string | null) => {
    if (!expiresAt) return { variant: "info" as const, label: "No Expiry", icon: Clock };
    
    const date = new Date(expiresAt);
    if (isPast(date)) return { variant: "error" as const, label: "Expired", icon: AlertCircle };
    
    const warningDate = addDays(new Date(), 30);
    if (isBefore(date, warningDate)) return { variant: "warning" as const, label: "Expires Soon", icon: Clock };
    
    return { variant: "success" as const, label: "Valid", icon: CheckCircle };
  };

  const renderArtifact = (artifact: any) => {
    const status = getExpirationStatus(artifact.expiresAt);
    const StatusIcon = status.icon;
    
    return (
      <div key={artifact.id} className={styles.artifactCard}>
        <div className={styles.cardTopRow}>
          <div className={styles.cardTypeAndStatus}>
            <span className={styles.artifactType}>
              {humanizeLabels.humanizeArtifactType(artifact.artifactType || "Unknown Type")}
            </span>
            <Badge variant={status.variant} className={styles.statusBadge}>
              <StatusIcon size={12} className={styles.badgeIcon} />
              {status.label}
            </Badge>
          </div>
          <div className={styles.cardDates}>
            <span className={styles.dateText}>
              Uploaded on {artifact.createdAt ? format(new Date(artifact.createdAt), "MMM d, yyyy") : "—"}
            </span>
          </div>
        </div>
        <div className={styles.cardBottomRow}>
          <div className={styles.accountCell}>
            {artifact.artifactType === 'credit_report' || artifact.artifactType === 'consumer_disclosure' ? (
              <div className={styles.bureauInfo}>
                <BureauBadge bureauName={artifact.bureauName} size="sm" />
                <span className={styles.accountCount}>
                  {artifact.linkedAccountCount ? `${artifact.linkedAccountCount} account${artifact.linkedAccountCount !== 1 ? 's' : ''} found` : "No accounts found yet"}
                </span>
              </div>
            ) : artifact.tradelineId ? (
              <>
                <span className={styles.accountNumber}>{artifact.tradelineAccountNumber || "Unknown"}</span>
                <span className={styles.accountType}>{artifact.tradelineAccountType}</span>
              </>
            ) : (
              <span className={styles.notLinked}>Not connected to an account</span>
            )}
          </div>
          <div className={styles.actionsCell}>
            <Button asChild variant="ghost" size="icon-sm" className={styles.actionBtn}>
              <Link to={`/upload-review/${artifact.id}`} title="View Document">
                <LinkIcon size={16} />
              </Link>
            </Button>
            <DeleteArtifactButton id={artifact.id} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Your Reports | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader 
        title="Your Reports" 
        subtitle="Your uploaded credit report files."
      >
        <div className={styles.headerActions}>
          <Button onClick={() => setIsCreateOpen(true)} className={styles.createButton}>
            <Plus size={16} /> Add a Report
          </Button>
        </div>
      </PageHeader>

      <div className={styles.mainContainer}>
        {isFetching ? (
          <div className={styles.cardList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.artifactCard}>
                <div className={styles.cardTopRow}>
                  <Skeleton className={styles.skeletonCell} style={{ width: '200px' }} />
                  <Skeleton className={styles.skeletonCell} style={{ width: '150px' }} />
                </div>
                <div className={styles.cardBottomRow}>
                  <Skeleton className={styles.skeletonCell} style={{ width: '250px' }} />
                  <Skeleton className={styles.skeletonIcon} style={{ width: '60px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : data?.artifacts && data.artifacts.length > 0 ? (
          <div className={styles.cardList}>
            {data.artifacts.map(renderArtifact)}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <FileText size={40} />
            <h3>No Reports Found</h3>
            <p>Upload your first credit report to get started.</p>
            <Button variant="default" size="sm" onClick={() => setIsCreateOpen(true)}>
              Add a Report
            </Button>
          </div>
        )}
      </div>

      <CreateArtifactDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </>
  );
}

function CreateArtifactDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate: createArtifact, isPending } = useCreateReportArtifact();
  const { data: tradelineData } = useTradelineList();
  
  const form = useForm({
    schema: createArtifactSchema,
    defaultValues: {
      tradelineId: 0,
      reportDate: new Date(),
      artifactType: "",
      expiresAt: undefined,
    },
  });

  const onSubmit = (values: z.infer<typeof createArtifactSchema>) => {
    createArtifact(
      {
        tradelineId: values.tradelineId,
        reportDate: values.reportDate,
        artifactType: values.artifactType,
        storageUrl: null, // Always null for new artifacts in UI
        expiresAt: values.expiresAt || null,
        data: {}, // Empty metadata for now
        sha256: null,
      },
      {
        onSuccess: () => {
          toast.success("Artifact created successfully");
          onOpenChange(false);
          form.setValues({ 
            tradelineId: 0, 
            reportDate: new Date(), 
            artifactType: "", 
            expiresAt: undefined
          });
        },
        onError: () => {
          toast.error("Failed to create artifact");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a File</DialogTitle>
          <DialogDescription>
            Save a new file to your account.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
            <FormItem name="tradelineId">
              <FormLabel>Account (Optional)</FormLabel>
              <FormControl>
                <Select 
                  value={String(form.values.tradelineId || "0")} 
                  onValueChange={(val) => form.setValues(prev => ({...prev, tradelineId: parseInt(val)}))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None (not linked)</SelectItem>
                    {tradelineData?.tradelines.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.accountNumber} - {t.bureauName || "Unknown Bureau"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>

            <FormItem name="artifactType">
              <FormLabel>What kind of file is this?</FormLabel>
              <FormControl>
                <Select 
                  value={form.values.artifactType} 
                  onValueChange={(val) => form.setValues(prev => ({...prev, artifactType: val}))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select file type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit_report">Credit Report</SelectItem>
                    <SelectItem value="dispute_letter">Dispute Letter</SelectItem>
                    <SelectItem value="bureau_response">Bureau Response</SelectItem>
                    <SelectItem value="consumer_disclosure">Consumer Disclosure</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>

            <div className={styles.formRow}>
              <FormItem name="reportDate" className={styles.flex1}>
                <FormLabel>When was this report made?</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={styles.dateButton}>
                        {form.values.reportDate ? format(form.values.reportDate, "PPP") : <span>Pick a date</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent removeBackgroundAndPadding className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.values.reportDate}
                      onSelect={(date) => date && form.setValues(prev => ({...prev, reportDate: date}))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>

              <FormItem name="expiresAt" className={styles.flex1}>
                <FormLabel>When does this expire? (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant="outline" className={styles.dateButton}>
                        {form.values.expiresAt ? format(form.values.expiresAt, "PPP") : <span>No Expiry</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent removeBackgroundAndPadding className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.values.expiresAt}
                      onSelect={(date) => form.setValues(prev => ({...prev, expiresAt: date}))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save File"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteArtifactButton({ id }: { id: number }) {
  const { mutate: deleteArtifact, isPending } = useDeleteReportArtifact();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    deleteArtifact({ id }, {
      onSuccess: () => {
        toast.success("Artifact deleted");
        setIsOpen(false);
      },
      onError: () => {
        toast.error("Failed to delete artifact");
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
          <DialogTitle>Delete This File?</DialogTitle>
          <DialogDescription>
            Are you sure? This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button variant="error" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}