import { useMemo, useState } from "react";
import { FileImage, Loader2, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";

import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { useConsumerIdentification } from "../helpers/useConsumerIdentification";
import styles from "./ConsumerIdentificationManager.module.css";

const MAX_ID_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferImageMimeType(file: File): "image/jpeg" | "image/png" {
  if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read identification image"));
    reader.readAsDataURL(file);
  });
}

export function ConsumerIdentificationManager() {
  const {
    identification,
    isLoading,
    uploadIdentification,
    isUploading,
    deleteIdentification,
    isDeleting,
  } = useConsumerIdentification();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDataUrl, setSelectedDataUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (selectedDataUrl) return selectedDataUrl;
    if (!identification) return null;
    return `${identification.fileUrl}?v=${encodeURIComponent(identification.updatedAt)}`;
  }, [identification, selectedDataUrl]);

  const handleFileSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (file.type && file.type !== "image/jpeg" && file.type !== "image/png") {
      setFileError("Upload a PNG or JPEG image of your identification");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      setSelectedFile(file);
      setSelectedDataUrl(dataUrl);
      setFileError(null);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Failed to read identification image");
    }
  };

  const handleSave = async () => {
    if (!selectedFile || !selectedDataUrl) {
      setFileError("Choose an identification image first");
      return;
    }

    await uploadIdentification({
      fileName: selectedFile.name,
      fileType: inferImageMimeType(selectedFile),
      fileDataBase64: selectedDataUrl,
    });

    setSelectedFile(null);
    setSelectedDataUrl(null);
    setFileError(null);
  };

  const handleDelete = async () => {
    if (!identification) return;

    const confirmed = window.confirm(
      "Delete your saved identification image? Future letters cannot be mailed until you upload a replacement."
    );
    if (!confirmed) return;

    await deleteIdentification();
    setSelectedFile(null);
    setSelectedDataUrl(null);
    setFileError(null);
  };

  const isBusy = isUploading || isDeleting;

  return (
    <section className={styles.container} aria-labelledby="consumer-identification-title">
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <ShieldCheck size={22} />
        </div>
        <div>
          <h3 id="consumer-identification-title" className={styles.title}>
            Identification
          </h3>
          <p className={styles.subtitle}>
            This image is saved to your account and added when a dispute package needs identification.
          </p>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.previewPanel}>
          {isLoading ? (
            <div className={styles.emptyPreview}>
              <Loader2 className={styles.spin} size={22} />
            </div>
          ) : previewUrl ? (
            <img className={styles.previewImage} src={previewUrl} alt="Uploaded identification preview" />
          ) : (
            <div className={styles.emptyPreview}>
              <FileImage size={30} />
              <span>No ID image saved</span>
            </div>
          )}
        </div>

        <div className={styles.controls}>
          {identification && !selectedFile && (
            <div className={styles.metadata}>
              <span>{identification.fileName}</span>
              <span>{formatFileSize(identification.fileSizeBytes)}</span>
            </div>
          )}

          {selectedFile && (
            <div className={styles.metadata}>
              <span>{selectedFile.name}</span>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
          )}

          <FileDropzone
            accept=".png,.jpg,.jpeg"
            maxSize={MAX_ID_FILE_SIZE_BYTES}
            onFilesSelected={handleFileSelected}
            disabled={isBusy}
            icon={<Upload size={34} />}
            title={identification ? "Choose replacement image" : "Upload identification image"}
            subtitle="PNG or JPEG, max 8 MB"
            className={styles.dropzone}
          />

          {fileError && <p className={styles.errorText}>{fileError}</p>}

          <div className={styles.actions}>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!selectedFile || isBusy}
              variant="primary"
            >
              {isUploading ? (
                <>
                  <Loader2 className={styles.spin} size={16} />
                  Saving...
                </>
              ) : identification ? (
                <>
                  <RefreshCw size={16} />
                  Replace ID
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Save ID
                </>
              )}
            </Button>

            {identification && (
              <Button
                type="button"
                onClick={handleDelete}
                disabled={isBusy}
                variant="destructive"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className={styles.spin} size={16} />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete ID
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
