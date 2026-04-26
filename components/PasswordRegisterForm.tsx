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
import { useAuth } from "../helpers/useAuth";
import {
  schema,
  postRegister,
} from "../endpoints/auth/register_with_password_POST.schema";
import styles from "./PasswordRegisterForm.module.css";

export type RegisterFormData = z.infer<typeof schema>;

interface PasswordRegisterFormProps {
  className?: string;
  defaultValues?: Partial<RegisterFormData>;
}

export const PasswordRegisterForm: React.FC<PasswordRegisterFormProps> = ({
  className,
  defaultValues,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const { onLogin } = useAuth();
  const navigate = useNavigate();

  const form = useForm({
    schema,
    defaultValues: defaultValues || {
      email: "",
      password: "",
      displayName: "",
      termsAccepted: undefined,
      dataConsentAccepted: undefined,
      legalNameSignature: "",
    },
  });

  const termsChecked = form.values.termsAccepted === true;
  const dataConsentChecked = form.values.dataConsentAccepted === true;
  const legalNameValue = form.values.legalNameSignature || "";
  const isSubmitDisabled =
    isLoading ||
    !termsChecked ||
    !dataConsentChecked ||
    legalNameValue.trim().length < 2;

  const handleSubmit = async (data: z.infer<typeof schema>) => {
    setError(null);
    setIsLoading(true);

    try {
      const anonArtifactIdStr = sessionStorage.getItem("crp_anon_artifact_id");
      const anonClaimToken = sessionStorage.getItem("crp_anon_claim_token");
      let tempArtifactId: number | undefined;

      if (anonArtifactIdStr) {
        const parsed = parseInt(anonArtifactIdStr, 10);
        if (!isNaN(parsed)) {
          tempArtifactId = parsed;
        }
      }

      const requestData = {
        ...data,
        ...(tempArtifactId !== undefined && anonClaimToken
          ? { tempArtifactId, claimToken: anonClaimToken }
          : {}),
      };

      const result = await postRegister(requestData);
      onLogin(result.user);

      if (result.claimedArtifactId) {
        sessionStorage.removeItem("crp_anon_artifact_id");
        sessionStorage.removeItem("crp_anon_claim_token");
        navigate(`/upload-results/${result.claimedArtifactId}`);
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
    }
  };

  return (
    <>
      <TermsDialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen} />
      <Form {...form}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <form
          onSubmit={form.handleSubmit((data) =>
            handleSubmit(data as z.infer<typeof schema>)
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

          <FormItem name="termsAccepted">
            <div className={styles.checkboxRow}>
              <Checkbox
                id="terms-accepted"
                checked={termsChecked}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    termsAccepted: e.target.checked,
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
                . I understand Credit Regulator Pro helps me but does not act for me. I am sending these letters myself.
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
                    dataConsentAccepted: e.target.checked,
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
                <Spinner size="sm" /> Creating your account...
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
