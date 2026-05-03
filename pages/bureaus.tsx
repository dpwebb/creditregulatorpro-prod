import { useState } from "react";
import { Helmet } from "react-helmet";
import { z } from "zod";
import { useBureauList, useCreateBureau, useDeleteBureau } from "../helpers/bureauQueries";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "../components/Dialog";
import { Form, FormItem, FormLabel, FormControl, FormMessage, useForm } from "../components/Form";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { PageHeader } from "../components/PageHeader";

import { Plus, Trash2, Building2, Globe, Mail, ExternalLink } from "lucide-react";
import { useToast } from "../helpers/useToast";
import { Badge } from "../components/Badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { BulkActionsToolbar, BulkSelectAllCheckbox, BulkRowCheckbox } from "../components/BulkActionsToolbar";
import { exportToCSV } from "../helpers/csvExporter";
import { generateReportPDF } from "../helpers/reportGenerator";
import { ExportDropdown } from "../components/ExportDropdown";
import { getBureauDisputeAddress, formatBureauAddressForLetter } from "../helpers/bureauDisputeAddresses";
import styles from "./bureaus.module.css";

const createBureauSchema = z.object({
  name: z.string().min(1, "Bureau name is required"),
  contactEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
});

export default function BureausPage() {
  const { data, isFetching, error } = useBureauList();
  const { mutateAsync: deleteBureau } = useDeleteBureau();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const { showSuccess, showError } = useToast();

  const allIds = data?.bureaus.map((b) => b.id) || [];

  const handleBulkDelete = async (ids: number[]) => {
    try {
      await Promise.all(ids.map((id) => deleteBureau({ id })));
      showSuccess(`Successfully deleted ${ids.length} bureaus`);
      setSelectedIds(new Set());
    } catch (err) {
      showError("Failed to delete some bureaus");
      console.error(err);
    }
  };

  const handleExport = async (ids: number[], format: "csv" | "pdf") => {
    const bureausToExport = data?.bureaus.filter((b) => ids.includes(b.id)) || [];
    if (bureausToExport.length === 0) return;

    if (format === "csv") {
      exportToCSV(bureausToExport, "bureaus-export", [
        { key: "id", label: "ID" },
        { key: "name", label: "Name" },
        { key: "region", label: "Region" },
        { key: "contactEmail", label: "Contact Email" },
        { key: "contactPhone", label: "Contact Phone" },
      ]);
    } else {
      const pdfBase64 = await generateReportPDF({
        title: "Bureaus Export",
        subtitle: `Generated on ${new Date().toLocaleDateString()}`,
        columns: [
          { header: "ID", dataKey: "id", width: "auto" },
          { header: "Name", dataKey: "name", width: "*" },
          { header: "Region", dataKey: "region", width: "auto" },
          { header: "Email", dataKey: "contactEmail", width: "*" },
          { header: "Phone", dataKey: "contactPhone", width: "auto" },
        ],
        data: bureausToExport,
      });

      // Download PDF
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = "bureaus-export.pdf";
      link.click();
    }
  };

  const handleExportAll = async (format: "csv" | "pdf") => {
    setIsExporting(true);
    try {
      await handleExport(allIds, format);
    } finally {
      setIsExporting(false);
    }
  };

  if (error) {
    return <div className={styles.error}>Error loading bureaus. Please try again.</div>;
  }

  return (
    <>
      <Helmet>
        <title>Credit Reporting Companies | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader 
        title={
          <div className={styles.titleWithHelp}>
            Credit Reporting Companies
            <HelpTooltip
              content={
                <p>
                  These are the companies that keep track of your credit. In Canada, the main ones are Equifax and TransUnion.
                </p>
              }
              title="Credit Reporting Agencies"
            />
          </div>
        }
        subtitle="See the companies that have your credit information."
      >
        <div className={styles.headerActions}>
          <ExportDropdown
            onExportCSV={() => handleExportAll("csv")}
            onExportPDF={() => handleExportAll("pdf")}
            isExporting={isExporting}
            label="Export All"
            variant="outline"
          />
          <Button onClick={() => setIsCreateOpen(true)} className={styles.createButton}>
            <Plus size={16} /> Add a Company
          </Button>
        </div>
      </PageHeader>

      <BulkActionsToolbar
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        allIds={allIds}
        onBulkDelete={handleBulkDelete}
        onBulkExport={handleExport}
        entityName="bureaus"
      />

      <div className={styles.cardListContainer}>
        {data?.bureaus && data.bureaus.length > 0 && (
          <div className={styles.listHeader}>
            <BulkSelectAllCheckbox
              selectedIds={selectedIds}
              allIds={allIds}
              onSelectionChange={setSelectedIds}
            />
            <span className={styles.selectAllLabel}>Select All</span>
          </div>
        )}

        <div className={styles.cardList}>
          {isFetching ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${styles.bureauCard} ${styles.skeletonCard}`}>
                <div className={styles.cardTopRow}>
                  <div className={styles.cardTopLeft}>
                    <Skeleton className={styles.skeletonCheckbox} />
                    <Skeleton className={styles.skeletonIcon} />
                    <Skeleton className={styles.skeletonTitle} />
                  </div>
                </div>
                <div className={styles.cardBottomRow}>
                  <Skeleton className={styles.skeletonCell} />
                  <Skeleton className={styles.skeletonCell} />
                  <Skeleton className={styles.skeletonCell} />
                </div>
              </div>
            ))
          ) : data?.bureaus && data.bureaus.length > 0 ? (
            data.bureaus.map((bureau) => {
              const officialAddress = getBureauDisputeAddress(bureau.name);
              return (
                <div key={bureau.id} className={`${styles.bureauCard} ${selectedIds.has(bureau.id) ? styles.selectedCard : ""}`}>
                  <div className={styles.cardTopRow}>
                    <div className={styles.cardTopLeft}>
                      <BulkRowCheckbox
                        id={bureau.id}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                      />
                      <div className={styles.nameCell}>
                        <div className={styles.iconWrapper}>
                          <Building2 size={16} />
                        </div>
                        <div className={styles.nameAndBadge}>
                          <span className={styles.bureauName}>{bureau.name}</span>
                          <Badge variant="primary" className={styles.regionBadge}>
                            <Globe size={12} className={styles.regionIcon} />
                            {bureau.region}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardTopRight}>
                      <DeleteBureauButton id={bureau.id} name={bureau.name} />
                    </div>
                  </div>
                  
                  <div className={styles.cardBottomRow}>
                    <div className={styles.infoGroup}>
                      <span className={styles.infoLabel}>Contact</span>
                      <span className={styles.infoValue}>
                        {bureau.contactEmail && <div>{bureau.contactEmail}</div>}
                        {bureau.contactPhone && <div>{bureau.contactPhone}</div>}
                        {!bureau.contactEmail && !bureau.contactPhone && <span className={styles.mutedText}>—</span>}
                      </span>
                    </div>
                    
                    <div className={styles.infoGroup}>
                      <span className={styles.infoLabel}>Dispute Mail Address</span>
                      <span className={styles.infoValue}>
                        {officialAddress ? (
                          <div className={styles.postalAddress}>
                            {formatBureauAddressForLetter(officialAddress).split("\n").map((line, idx) => (
                              <span key={idx}>{line}</span>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.mutedText}>—</span>
                        )}
                      </span>
                    </div>

                    <div className={styles.infoGroup}>
                      <span className={styles.infoLabel}>Online Dispute</span>
                      <span className={styles.infoValue}>
                        {officialAddress ? (
                          officialAddress.email ? (
                            <div className={styles.disputeEmailCell}>
                              <Mail size={13} className={styles.disputeEmailIcon} />
                              <span>{officialAddress.email}</span>
                            </div>
                          ) : (
                            <a
                              href={officialAddress.onlineDisputeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.onlinePortalLink}
                            >
                              Online Portal Only
                              <ExternalLink size={12} />
                            </a>
                          )
                        ) : (
                          <span className={styles.mutedText}>—</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <Building2 size={40} />
              <h3>No Companies Added Yet</h3>
              <p>Add a credit reporting company to get started.</p>
              <Button variant="default" size="sm" onClick={() => setIsCreateOpen(true)}>
                Add One Now
              </Button>
            </div>
          )}
        </div>
      </div>

      <CreateBureauDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </>
  );
}

function CreateBureauDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate: createBureau, isPending } = useCreateBureau();
  const { showSuccess, showError } = useToast();
  
  const form = useForm({
    schema: createBureauSchema,
    defaultValues: {
      name: "",
      contactEmail: "",
      contactPhone: "",
    },
  });

  const onSubmit = (values: z.infer<typeof createBureauSchema>) => {
    createBureau(
      {
        name: values.name,
        contactEmail: values.contactEmail || null,
        contactPhone: values.contactPhone || null,
      },
      {
        onSuccess: () => {
          showSuccess("Company added!", {
            description: "You can now configure creditors to report to this bureau."
          });
          onOpenChange(false);
          form.setValues({ name: "", contactEmail: "", contactPhone: "" });
        },
        onError: () => {
          showError("Could not add the company");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className={styles.dialogHeaderWithHelp}>
            <DialogTitle>Add a Credit Reporting Company</DialogTitle>
            <HelpTooltip
              content="Make sure the name matches exactly what the company calls itself."
              side="bottom"
            />
          </div>
          <DialogDescription>
            Add a new credit reporting company.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
            <FormItem name="name">
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Equifax Canada" value={form.values.name} onChange={e => form.setValues(prev => ({...prev, name: e.target.value}))} />
              </FormControl>
              <FormMessage />
            </FormItem>

            <div className={styles.formRow}>
              <FormItem name="contactEmail" className={styles.flex1}>
                <FormLabel>Contact Email</FormLabel>
                <FormControl>
                  <Input placeholder="contact@bureau.ca" value={form.values.contactEmail || ""} onChange={e => form.setValues(prev => ({...prev, contactEmail: e.target.value}))} />
                </FormControl>
                <FormMessage />
              </FormItem>

              <FormItem name="contactPhone" className={styles.flex1}>
                <FormLabel>Contact Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+1 (555) 000-0000" value={form.values.contactPhone || ""} onChange={e => form.setValues(prev => ({...prev, contactPhone: e.target.value}))} />
                </FormControl>
                <FormMessage />
              </FormItem>
            </div>

            <div className={styles.readOnlyField}>
              <div className={styles.labelWithHelp}>
                <label>Region</label>
                <HelpTooltip
                  content="This system is currently configured for Canadian credit reporting standards (Metro2 CA extension)."
                  size={14}
                />
              </div>
              <div className={styles.readOnlyValue}>CA (Canada Only)</div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Adding..." : "Add Company"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBureauButton({ id, name }: { id: number; name: string }) {
  const { mutate: deleteBureau, isPending } = useDeleteBureau();
  const { showSuccess, showError } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    deleteBureau({ id }, {
      onSuccess: () => {
        showSuccess("Company removed");
        setIsOpen(false);
      },
      onError: () => {
        showError("Could not remove the company");
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
          <DialogTitle>Remove This Company?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <span className={styles.highlightName}>"{name}"</span>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button variant="error" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Remove Company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}