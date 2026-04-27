import React, { useEffect, useState } from "react";
import { useForm, Form, FormItem, FormLabel, FormControl, FormMessage } from "./Form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { Textarea } from "./Textarea";
import { FileDropzone } from "./FileDropzone";
import { useBureauCommunication } from "../helpers/useBureauCommunication";
import { usePacketList } from "../helpers/packetQueries";
import { useTradelineList } from "../helpers/tradelineQueries";
import { BureauCommunicationTypes } from "../endpoints/evidence/bureau-communication_POST.schema";
import { z } from "zod";
import { FileText, X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import styles from "./BureauCommunicationDialog.module.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/jpg";

const formSchema = z.object({
  communicationType: z.enum(BureauCommunicationTypes, {
    required_error: "Please select a communication type",
  }),
  linkMode: z.enum(["packet", "tradeline"]),
  packetId: z.string().optional(),
  tradelineId: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => {
  if (data.linkMode === "packet" && !data.packetId) return false;
  if (data.linkMode === "tradeline" && !data.tradelineId) return false;
  return true;
}, {
  message: "Please select an item to link",
  path: ["linkMode"], // This might not show up perfectly on the radio group, but we handle validation display manually if needed
});

type FormValues = z.infer<typeof formSchema>;

interface BureauCommunicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPacketId?: number;
  defaultTradelineId?: number;
}

export function BureauCommunicationDialog({
  open,
  onOpenChange,
  defaultPacketId,
  defaultTradelineId,
}: BureauCommunicationDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const { mutate: uploadCommunication, isPending } = useBureauCommunication();
  const { data: packetData } = usePacketList();
  const { data: tradelineData } = useTradelineList();

  const form = useForm({
    schema: formSchema,
    defaultValues: {
      communicationType: "BUREAU_RESPONSE_RECEIVED",
      linkMode: defaultTradelineId ? "tradeline" : "packet",
      packetId: defaultPacketId?.toString() ?? "",
      tradelineId: defaultTradelineId?.toString() ?? "",
      description: "",
    },
  });

  // Reset form when dialog opens/closes or defaults change
  useEffect(() => {
    if (open) {
      form.setValues({
        communicationType: "BUREAU_RESPONSE_RECEIVED",
        linkMode: defaultTradelineId ? "tradeline" : "packet",
        packetId: defaultPacketId?.toString() ?? "",
        tradelineId: defaultTradelineId?.toString() ?? "",
        description: "",
      });
      setFile(null);
      setFileError(null);
    }
  }, [open, defaultPacketId, defaultTradelineId, form.setValues]);

  const handleFileSelect = (files: File[]) => {
    if (files.length > 0) {
      setFile(files[0]);
      setFileError(null);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
  };

  const onSubmit = async (values: FormValues) => {
    if (!file) {
      setFileError("Please upload a file");
      return;
    }

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        // The endpoint expects the full data url or just base64? 
        // Looking at endpoint implementation: `CryptoJS.SHA256(input.fileDataBase64)` and `fileSizeBytes` calculation suggests it might handle raw base64 or data url.
        // However, usually for `fileDataBase64` fields in this project, we pass the full Data URL as it's often used for storageUrl directly.
        // The endpoint stores it directly: `storageUrl: input.fileDataBase64`.
        // So passing the result of readAsDataURL is correct.

        uploadCommunication({
          fileDataBase64: base64String,
          fileName: file.name,
          fileType: file.type,
          communicationType: values.communicationType,
          packetId: values.linkMode === "packet" && values.packetId ? parseInt(values.packetId) : undefined,
          tradelineId: values.linkMode === "tradeline" && values.tradelineId ? parseInt(values.tradelineId) : undefined,
          description: values.description,
        }, {
          onSuccess: () => {
            toast.success("Communication logged and added to evidence chain");
            onOpenChange(false);
          }
        });
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
      };
    } catch (error) {
      console.error("Submission error", error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const linkMode = form.values.linkMode;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Log Bureau Communication</DialogTitle>
          <DialogDescription>
            Upload correspondence to create an immutable evidence trail.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
            
            {/* File Upload Section */}
            <div className={styles.section}>
              <FormLabel className={fileError ? styles.errorLabel : ""}>
                Communication File <span className={styles.required}>*</span>
              </FormLabel>
              
              {!file ? (
                <div className={fileError ? styles.dropzoneError : ""}>
                  <FileDropzone
                    accept=".pdf,.png,.jpg,.jpeg"
                    maxSize={MAX_FILE_SIZE}
                    onFilesSelected={handleFileSelect}
                    title="Drop PDF or Image here"
                    subtitle="Max 10MB"
                    className={styles.dropzone}
                  />
                </div>
              ) : (
                <div className={styles.filePreview}>
                  <div className={styles.fileIcon}>
                    <FileText size={24} />
                  </div>
                  <div className={styles.fileInfo}>
                    <div className={styles.fileName}>{file.name}</div>
                    <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleRemoveFile}
                    className={styles.removeFileBtn}
                  >
                    <X size={16} />
                  </Button>
                </div>
              )}
              {fileError && <span className={styles.errorMessage}>{fileError}</span>}
            </div>

            {/* Communication Type */}
            <FormItem name="communicationType">
              <FormLabel>Communication Type <span className={styles.required}>*</span></FormLabel>
              <FormControl>
                <Select 
                  value={form.values.communicationType} 
                  onValueChange={(val) => form.setValues(prev => ({ ...prev, communicationType: val as any }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="BUREAU_RESPONSE_RECEIVED">Bureau Response Received</SelectItem>
                      <SelectItem value="BUREAU_ACKNOWLEDGMENT">Acknowledgment Letter</SelectItem>
                      <SelectItem value="BUREAU_DENIAL">Denial Letter</SelectItem>
                      <SelectItem value="BUREAU_VERIFICATION_REQUEST">Verification Request</SelectItem>
                      <SelectItem value="BUREAU_CORRECTION_NOTICE">Correction Notice</SelectItem>
                      <SelectItem value="BUREAU_OTHER">Other Communication</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>

            {/* Link To Section */}
            <div className={styles.section}>
              <FormLabel>Link To <span className={styles.required}>*</span></FormLabel>
              
              <div className={styles.toggleGroup}>
                <button
                  type="button"
                  className={`${styles.toggleButton} ${linkMode === "packet" ? styles.active : ""}`}
                  onClick={() => form.setValues(prev => ({ ...prev, linkMode: "packet" }))}
                >
                  Packet
                </button>
                <button
                  type="button"
                  className={`${styles.toggleButton} ${linkMode === "tradeline" ? styles.active : ""}`}
                  onClick={() => form.setValues(prev => ({ ...prev, linkMode: "tradeline" }))}
                >
                  Tradeline
                </button>
              </div>

              {linkMode === "packet" ? (
                <FormItem name="packetId">
                  <FormControl>
                    <Select
                      value={form.values.packetId}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, packetId: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a packet..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {packetData?.packets.map((packet) => (
                            <SelectItem key={packet.id} value={packet.id.toString()}>
                              Packet #{packet.id} - {packet.terminalLabel || "Untitled"}
                            </SelectItem>
                          ))}
                          {(!packetData?.packets || packetData.packets.length === 0) && (
                            <SelectItem value="_empty" disabled>No packets found</SelectItem>
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              ) : (
                <FormItem name="tradelineId">
                  <FormControl>
                    <Select
                      value={form.values.tradelineId}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, tradelineId: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tradeline..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {tradelineData?.tradelines.map((tl) => (
                            <SelectItem key={tl.id} value={tl.id.toString()}>
                              {tl.accountNumber} - {tl.bureauName || "Unknown Bureau"}
                            </SelectItem>
                          ))}
                          {(!tradelineData?.tradelines || tradelineData.tradelines.length === 0) && (
                            <SelectItem value="_empty" disabled>No tradelines found</SelectItem>
                          )}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
              {/* Show generic error if linkMode validation fails */}
              {form.errors.linkMode && (
                <span className={styles.errorMessage}>
                  {typeof form.errors.linkMode === 'string' ? form.errors.linkMode : "Please select an item"}
                </span>
              )}
            </div>

            {/* Notes */}
            <FormItem name="description">
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Add any additional context..." 
                  value={form.values.description}
                  onChange={(e) => form.setValues(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Upload & Log
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}