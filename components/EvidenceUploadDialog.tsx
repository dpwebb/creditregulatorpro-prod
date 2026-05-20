import React, { useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { useUploadAttachmentMutation } from "../helpers/attachmentQueries";
import { FRONTEND_UPLOAD_LIMITS } from "../helpers/frontendProductionReadinessUx";
import styles from "./EvidenceUploadDialog.module.css";

const EVIDENCE_UPLOAD_LIMIT = FRONTEND_UPLOAD_LIMITS.evidenceAttachment;

interface EvidenceUploadDialogProps {
  obligationInstanceId?: number;
  packetId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EvidenceUploadDialog: React.FC<EvidenceUploadDialogProps> = ({
  obligationInstanceId,
  packetId,
  open,
  onOpenChange,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const uploadMutation = useUploadAttachmentMutation();

  const handleFileSelect = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!obligationInstanceId && !packetId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Content = base64String.split(',')[1];

      uploadMutation.mutate({
        obligationInstanceId,
        packetId,
        fileName: file.name,
        fileType: file.type,
        fileDataBase64: base64Content,
        description: description || undefined,
      }, {
        onSuccess: () => {
          setFile(null);
          setDescription("");
          onOpenChange(false);
        }
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
          <DialogDescription>
            Upload supporting documents for this obligation. Accepted formats: PDF, PNG, JPG. Server limit: {EVIDENCE_UPLOAD_LIMIT.label}.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.form}>
          {!file ? (
            <FileDropzone
              accept=".pdf,.png,.jpg,.jpeg"
              maxSize={EVIDENCE_UPLOAD_LIMIT.maxBytes}
              onFilesSelected={handleFileSelect}
              title="Drag & drop evidence file"
              subtitle={`PDF or images up to ${EVIDENCE_UPLOAD_LIMIT.label}`}
              className={styles.dropzone}
            />
          ) : (
            <div className={styles.filePreview}>
              <div className={styles.fileInfo}>
                <FileText className={styles.fileIcon} />
                <div className={styles.fileMeta}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setFile(null)}>
                <X size={16} />
              </Button>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="description" className={styles.label}>Description (Optional)</label>
            <textarea
              id="description"
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a brief description of this evidence..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleUpload} 
            disabled={!file || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
