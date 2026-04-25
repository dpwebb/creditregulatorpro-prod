import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./Dialog";
import { useCreateCheckout } from "../helpers/useCreateCheckout";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "../helpers/_publicConfigs";
import { SubscriptionCheckoutForm } from "./SubscriptionCheckoutForm";
import { Spinner } from "./Spinner";
import { Button } from "./Button";
import { useQueryClient } from "@tanstack/react-query";
import { SUBSCRIPTION_QUERY_KEY } from "../helpers/subscriptionQueries";
import { useConfirmSubscriptionPayment } from "../helpers/useConfirmSubscriptionPayment";
import styles from "./SubscriptionUpgradeDialog.module.css";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export interface SubscriptionUpgradeDialogProps {
  open: boolean;
  plan: "monthly" | "annual";
  onOpenChange: (open: boolean) => void;
}

export const SubscriptionUpgradeDialog: React.FC<SubscriptionUpgradeDialogProps> = ({
  open,
  plan,
  onOpenChange,
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const hasMutatedRef = useRef(false);
  const queryClient = useQueryClient();
  const createCheckout = useCreateCheckout();
  const confirmPayment = useConfirmSubscriptionPayment();

  useEffect(() => {
    if (open && plan && !showSuccess && !hasMutatedRef.current) {
      hasMutatedRef.current = true;
      
      createCheckout.mutate(
        { plan },
        {
          onSuccess: (data) => {
            if (data.clientSecret) {
              setClientSecret(data.clientSecret);
            }
            if (data.subscriptionId) {
              setSubscriptionId(data.subscriptionId);
            }
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, showSuccess]);

  const handleRetry = () => {
    hasMutatedRef.current = true;
    createCheckout.mutate(
      { plan },
      {
        onSuccess: (data) => {
          if (data.clientSecret) {
            setClientSecret(data.clientSecret);
          }
          if (data.subscriptionId) {
            setSubscriptionId(data.subscriptionId);
          }
        },
      }
    );
  };

  const handlePaymentSuccess = async () => {
    if (subscriptionId) {
      try {
        await confirmPayment.mutateAsync({ stripeSubscriptionId: subscriptionId, plan });
      } catch (error) {
        console.error("Failed to confirm subscription payment", error);
      }
    }

    setShowSuccess(true);
    queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
    // Auto close after a brief delay to show success state
    setTimeout(() => {
      onOpenChange(false);
      setShowSuccess(false);
    }, 2000);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setShowSuccess(false);
      setClientSecret(null);
      setSubscriptionId(null);
      hasMutatedRef.current = false;
    }
    onOpenChange(isOpen);
  };

  const elementsOptions = useMemo(() => {
    if (!clientSecret) return undefined;
    return {
      clientSecret,
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#1a3dcc",
          colorBackground: "#ffffff",
          colorText: "#263044",
          colorDanger: "#e62e4f",
          fontFamily: "Inter, system-ui, sans-serif",
          borderRadius: "8px",
        },
      },
    };
  }, [clientSecret]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Upgrade Subscription</DialogTitle>
          <DialogDescription>
            Enter your payment details to start your {plan} plan.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.body}>
          {showSuccess ? (
            <div className={styles.successState}>
              <div className={styles.successIcon}>✓</div>
              <h3 className={styles.successTitle}>Subscription Updated!</h3>
              <p className={styles.successText}>Your plan has been successfully upgraded.</p>
            </div>
          ) : (
            <>
              {createCheckout.isPending && (
                <div className={styles.loadingState}>
                  <Spinner size="md" />
                  <p className={styles.loadingText}>Initializing secure checkout...</p>
                </div>
              )}

              {createCheckout.isError && (
                <div className={styles.errorState}>
                  <p className={styles.errorMessage}>
                    {createCheckout.error instanceof Error
                      ? createCheckout.error.message
                      : "Failed to initialize checkout."}
                  </p>
                  <Button variant="outline" onClick={handleRetry}>
                    Try Again
                  </Button>
                </div>
              )}

              {clientSecret && elementsOptions && (
                <Elements
                  stripe={stripePromise}
                  options={elementsOptions}
                >
                  <SubscriptionCheckoutForm
                    plan={plan}
                    clientSecret={clientSecret}
                    onPaymentSuccess={handlePaymentSuccess}
                    onCancel={() => handleOpenChange(false)}
                  />
                </Elements>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};