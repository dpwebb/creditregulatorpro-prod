import React, { useState, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  Upload,
  X,
  Eye,
} from "lucide-react";
import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { Badge } from "./Badge";
import {
  REQUIRED_DOCUMENTS,
  VerificationDocuments,
  createDocumentItem,
  getDocumentStatus,
  DocumentItem,
  DocumentCategory,
} from "../helpers/identityTheftDocuments";
import * as Dialog from "@radix-ui/react-dialog";
import styles from "./IdentityTheftReportUpload.module.css";

interface IdentityTheftReportUploadProps {
  value?: VerificationDocuments | null;
  onChange: (value: VerificationDocuments) => void;
  className?: string;
  readOnly?: boolean;
}

export const IdentityTheftReportUpload: React.FC<
  IdentityTheftReportUploadProps
> = ({ value, onChange, className, readOnly = false }) => {
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<DocumentCategory | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);

  const documents = value?.documents || [];
  const status = getDocumentStatus(value);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedCategory) return;

      setUploading(true);
      try {
        const newDocs = await Promise.all(
          files.map((file) => createDocumentItem(file, selectedCategory)),
        );

        const updatedDocs = [...documents, ...newDocs];
        const updatedPackage = { documents: updatedDocs };
        const updatedStatus = getDocumentStatus(updatedPackage);
        const isComplete = updatedStatus.percentage === 100;

        onChange({
          documents: updatedDocs,
          metadata: {
            lastUpdated: new Date().toISOString(),
            completionPercentage: updatedStatus.percentage,
            isComplete,
          },
        });
        setSelectedCategory(null); // Reset selection after upload
      } catch (error) {
        console.error("Failed to process files", error);
        // In a real app, we'd show a toast here
      } finally {
        setUploading(false);
      }
    },
    [documents, onChange, selectedCategory],
  );

  const removeDocument = (docId: string) => {
    if (readOnly) return;
    const updatedDocs = documents.filter((d) => d.id !== docId);
    const updatedPackage = { documents: updatedDocs };
    const updatedStatus = getDocumentStatus(updatedPackage);
    const isComplete = updatedStatus.percentage === 100;

    onChange({
      documents: updatedDocs,
      metadata: {
        lastUpdated: new Date().toISOString(),
        completionPercentage: updatedStatus.percentage,
        isComplete,
      },
    });
  };

  const getCategoryStatus = (categoryId: string) => {
    const hasDoc = documents.some((d) => d.category === categoryId);
    return hasDoc ? "complete" : "pending";
  };

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>Identity Theft Documentation</h3>
          <Badge
            variant={status.percentage === 100 ? "success" : "warning"}
            className={styles.percentageBadge}
          >
            {status.percentage}% Complete
          </Badge>
        </div>
        <p className={styles.description}>
          To place an Extended Fraud Alert (7 years), you must provide an
          Identity Theft Report and proof of identity.
        </p>
      </div>

      <div className={styles.checklistGrid}>
        {REQUIRED_DOCUMENTS.map((req) => {
          const status = getCategoryStatus(req.id);
          const isSelected = selectedCategory === req.id;
          const uploadedDocs = documents.filter((d) => d.category === req.id);

          return (
            <div
              key={req.id}
              className={`
                ${styles.checklistItem} 
                ${status === "complete" ? styles.itemComplete : ""}
                ${isSelected ? styles.itemSelected : ""}
              `}
            >
              <div className={styles.itemHeader}>
                <div className={styles.itemIcon}>
                  {status === "complete" ? (
                    <CheckCircle2 size={20} className="text-green-600" />
                  ) : (
                    <AlertCircle size={20} className="text-amber-500" />
                  )}
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemLabel}>
                    {req.label}
                    {req.required && (
                      <span className={styles.requiredStar}>*</span>
                    )}
                  </div>
                  <div className={styles.itemDescription}>
                    {req.description}
                  </div>
                </div>
              </div>

              {/* Uploaded Files List for this Category */}
              {uploadedDocs.length > 0 && (
                <div className={styles.fileList}>
                  {uploadedDocs.map((doc) => (
                    <div key={doc.id} className={styles.fileItem}>
                      <FileText size={14} className={styles.fileIcon} />
                      <span className={styles.fileName} title={doc.name}>
                        {doc.name}
                      </span>
                      <div className={styles.fileActions}>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className={styles.actionButton}
                          title="Preview"
                        >
                          <Eye size={14} />
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => removeDocument(doc.id)}
                            className={`${styles.actionButton} ${styles.deleteButton}`}
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Action */}
              {!readOnly && (
                <div className={styles.uploadAction}>
                  {isSelected ? (
                    <div className={styles.activeUploadArea}>
                      <div className={styles.uploadHeader}>
                        <span className={styles.uploadTitle}>
                          Upload {req.label}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setSelectedCategory(null)}
                        >
                          <X size={16} />
                        </Button>
                      </div>
                      <FileDropzone
                        accept=".pdf,.jpg,.jpeg,.png"
                        maxSize={5 * 1024 * 1024} // 5MB
                        onFilesSelected={handleFilesSelected}
                        disabled={uploading}
                        title="Drop file here"
                        subtitle="PDF, JPG, PNG (Max 5MB)"
                        className={styles.miniDropzone}
                      />
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className={styles.addButton}
                      onClick={() => setSelectedCategory(req.id as any)}
                    >
                      <Upload size={14} />
                      {uploadedDocs.length > 0
                        ? "Add Another File"
                        : "Upload Document"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview Dialog */}
      <Dialog.Root
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <div className={styles.dialogHeader}>
              <Dialog.Title className={styles.dialogTitle}>
                {previewDoc?.name}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-sm">
                  <X size={20} />
                </Button>
              </Dialog.Close>
            </div>
            <div className={styles.previewContainer}>
              {previewDoc?.type.startsWith("image/") ? (
                <img
                  src={previewDoc.content}
                  alt={previewDoc.name}
                  className={styles.previewImage}
                />
              ) : (
                <iframe
                  src={previewDoc?.content}
                  className={styles.previewFrame}
                  title={previewDoc?.name}
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
