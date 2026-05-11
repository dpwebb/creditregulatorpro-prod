import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
  useForm,
} from "./Form";
import { Input } from "./Input";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { Checkbox } from "./Checkbox";
import { TermsDialog } from "./TermsDialog";
import { FileDropzone } from "./FileDropzone";
import { useAuth } from "../helpers/useAuth";
import {
  schema as registerSchema,
  postRegister,
} from "../endpoints/auth/register_with_password_POST.schema";
import { postReport } from "../endpoints/ingest/report_POST.schema";
import {
  clearAnonymousReportForSignup,
  getAnonymousReportForSignup,
} from "../helpers/anonymousReportHandoff";
import { toast } from "sonner";
import { FileImage, X } from "lucide-react";
import styles from "./PasswordRegisterForm.module.css";

export type RegisterFormData = z.infer<typeof registerSchema>;

const MAX_ID_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read identification image"));
    reader.readAsDataURL(file);
  });
}

function inferImageMimeType(file: File): "image/jpeg" | "image/png" {
  if (file.type === "image/png" || file.name.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

interface PasswordRegisterFormProps {
  className?: string;
  defaultValues?: Partial<RegisterFormData>;
}

export const PasswordRegisterForm: React.FC<PasswordRegisterFormProps> = ({
  className,
  defaultValues,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isImportingReport, setIsImportingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idFileError, setIdFileError] = useState<string | null>(null);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const { onLogin } = useAuth();
  const navigate = useNavigate();

  const form = useForm({
    schema: registerSchema,
    defaultValues: defaultValues || {
      email: "",
      password: "",
      displayName: "",
      termsAccepted: undefined,
      dataConsentAccepted: undefined,
      legalNameSignature: "",
      identificationFileName: "",
      identificationFileType: "image/jpeg",
      identificationFileDataBase64: "",
    },
  });

  const termsChecked = form.values.termsAccepted === true;
  const dataConsentChecked = form.values.dataConsentAccepted === true;
  const legalNameValue = form.values.legalNameSignature || "";
  const isSubmitDisabled =
    isLoading ||
    !termsChecked ||
    !dataConsentChecked ||
    legalNameValue.trim().length < 2 ||
    !form.values.identificationFileDataBase64;

  const handleIdentificationSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (file.type && file.type !== "image/jpeg" && file.type !== "image/png") {
      setIdFileError("Upload a PNG or JPEG image of your identification");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      setIdFile(file);
      setIdFileError(null);
      form.setValues((prev) => ({
        ...prev,
        identificationFileName: file.name,
        identificationFileType: inferImageMimeType(file),
        identificationFileDataBase64: dataUrl,
      }));
    } catch (readError) {
      setIdFileError(readError instanceof Error ? readError.message : "Failed to read identification image");
    }
  };

  const clearIdentification = () => {
    setIdFile(null);
    setIdFileError(null);
    form.setValues((prev) => ({
      ...prev,
      identificationFileName: "",
      identificationFileType: "image/jpeg",
      identificationFileDataBase64: "",
    }));
  };

  const handleSubmit = async (data: z.infer<typeof registerSchema>) => {
    setError(null);
    setIsLoading(true);
    setIsImportingReport(false);

    try {
      const pendingAnonymousReport = getAnonymousReportForSignup();
      sessionStorage.removeItem("crp_anon_artifact_id");
      sessionStorage.removeItem("crp_anon_claim_token");

      const result = await postRegister(data);
      onLogin(result.user);

      if (pendingAnonymousReport) {
        setIsImportingReport(true);
        try {
          const importResult = await postReport(pendingAnonymousReport);
          clearAnonymousReportForSignup();
          navigate(`/upload-results/${importResult.storageUrl}`);
        } catch (importError) {
          clearAnonymousReportForSignup();
          toast.error("Your account was created, but we could not import that report. Please upload it again.");
          console.error("Anonymous report import after registration failed:", importError);
          navigate("/upload");
        }
      } else {
        navigate("/");
      }
    } catch (err) {
      console.error("Registration error:", err);

      if (err instanceof Error) {
        const errorMessage = err.message;

        if (
          errorMessage.toLowerCase().includes("email already in use") ||
          errorMessage.toLowerCase().includes("already registered")
        ) {
          setError(
            "This email is already taken. Try logging in instead."
          );
        } else if (errorMessage.toLowerCase().includes("display name")) {
          setError("Please enter your name.");
        } else if (
          errorMessage.includes("display") ||
          errorMessage.includes("name")
        ) {
          setError("Please check your display name: " + errorMessage);
        } else {
          setError(errorMessage || "Something went wrong. Please try again.");
        }
      } else {
        console.log("Unknown error type:", err);
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
      setIsImportingReport(false);
    }
  };

  return (
    <>
      <TermsDialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen} />
      <Form {...form}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <form
          onSubmit={form.handleSubmit((data) =>
            handleSubmit(data as z.infer<typeof registerSchema>)
          )}
          className={`${styles.form} ${className || ""}`}
        >
          <FormItem name="email">
            <FormLabel>Your Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={form.values.email || ""}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <FormItem name="displayName">
            <FormLabel>Your Name</FormLabel>
            <FormControl>
              <Input
                id="register-display-name"
                autoComplete="name"
                placeholder="Your Name"
                value={form.values.displayName || ""}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    displayName: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormDescription>
              You can use spaces and special characters
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormItem name="password">
            <FormLabel>Your Password</FormLabel>
            <FormControl>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.values.password || ""}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormDescription>
              Use at least 8 characters. Include an uppercase letter, a lowercase letter, and a number.
            </FormDescription>
            <FormMessage />
          </FormItem>

          <FormItem name="identificationFileDataBase64">
            <FormLabel>Identification Image</FormLabel>
            <FormDescription>
              Upload a clear PNG or JPEG image of government-issued ID. It is saved to your account for future dispute packages.
            </FormDescription>
            {idFile ? (
              <div className={styles.idFilePreview}>
                <div className={styles.idFileIcon}>
                  <FileImage size={20} />
                </div>
                <div className={styles.idFileInfo}>
                  <span>{idFile.name}</span>
                  <small>{Math.max(1, Math.round(idFile.size / 1024))} KB</small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearIdentification}
                  aria-label="Remove identification image"
                >
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <FileDropzone
                accept=".png,.jpg,.jpeg"
                maxSize={MAX_ID_FILE_SIZE_BYTES}
                onFilesSelected={handleIdentificationSelected}
                disabled={isLoading}
                title="Upload identification image"
                subtitle="PNG or JPEG, max 8 MB"
                className={styles.idDropzone}
              />
            )}
            {idFileError && <p className={styles.fieldError}>{idFileError}</p>}
            <FormMessage />
          </FormItem>

          <FormItem name="termsAccepted">
            <div className={styles.checkboxRow}>
              <Checkbox
                id="terms-accepted"
                checked={termsChecked}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    termsAccepted: e.target.checked ? true : undefined,
                  }))
                }
              />
              <label htmlFor="terms-accepted" className={styles.checkboxLabel}>
                I agree to the{" "}
                <button
                  type="button"
                  className={styles.termsLink}
                  onClick={() => setTermsDialogOpen(true)}
                >
                  Terms of Use
                </button>
                . I understand Credit Regulator Pro helps me but does not represent me. If I use the print-and-mail service, I am still responsible for my letter.
              </label>
            </div>
            <FormMessage />
          </FormItem>

          <FormItem name="dataConsentAccepted">
            <div className={styles.checkboxRow}>
              <Checkbox
                id="data-consent-accepted"
                checked={dataConsentChecked}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    dataConsentAccepted: e.target.checked ? true : undefined,
                  }))
                }
              />
              <label htmlFor="data-consent-accepted" className={styles.checkboxLabel}>
                I allow Credit Regulator Pro to use my information only to help me create and send dispute letters.
              </label>
            </div>
            <FormMessage />
          </FormItem>

          <FormItem name="legalNameSignature">
            <FormLabel>Your Full Legal Name (to sign)</FormLabel>
            <FormControl>
              <Input
                autoComplete="name"
                placeholder="Type your full legal name here"
                value={legalNameValue}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    legalNameSignature: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <Button
            type="submit"
            disabled={isSubmitDisabled}
            className={styles.submitButton}
          >
            {isLoading ? (
              <>
                <Spinner size="sm" /> {isImportingReport ? "Importing your report..." : "Creating your account..."}
              </>
            ) : (
              "Create My Account"
            )}
          </Button>
        </form>
      </Form>
    </>
  );
};
