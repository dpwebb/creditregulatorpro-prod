import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./Dialog";
import { useCreatePaymentIntent } from "../helpers/usePaymentIntentMutations";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "../helpers/_publicConfigs";
import { StripeCheckoutForm } from "./StripeCheckoutForm";
import {
  POSTGRID_BASE_COST,
  POSTGRID_SURCHARGE_RATE,
  POSTGRID_TOTAL_COST,
} from "../helpers/postalBillingQueries";
import { Spinner } from "./Spinner";
import { Button } from "./Button";
import styles from "./StripePaymentDialog.module.css";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export interface StripePaymentDialogProps {
  packetId: number;
  open: boolean;
  baseCost?: number;
  surchargeRate?: number;
  totalCost?: number;
  mailType?: "registered" | "first_class";
  onOpenChange: (open: boolean) => void;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onBetaBypass: () => void;
}

export const StripePaymentDialog: React.FC<StripePaymentDialogProps> = ({
  packetId,
  open,
  baseCost = POSTGRID_BASE_COST,
  surchargeRate = POSTGRID_SURCHARGE_RATE,
  totalCost = POSTGRID_TOTAL_COST,
  mailType = "registered",
  onOpenChange,
  onPaymentSuccess,
  onBetaBypass,
}) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  const createIntent = useCreatePaymentIntent();

  useEffect(() => {
    if (open && packetId) {
      setClientSecret(null);
      setPaymentIntentId(null);
      
      createIntent.mutate(
        { packetId, mailType },
        {
          onSuccess: (data) => {
            if (data.isBeta) {
              onBetaBypass();
              onOpenChange(false);
            } else if (data.clientSecret && data.paymentIntentId) {
              setClientSecret(data.clientSecret);
              setPaymentIntentId(data.paymentIntentId);
            }
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, packetId]);

  const handleRetry = () => {
    createIntent.mutate(
      { packetId, mailType },
      {
        onSuccess: (data) => {
          if (data.isBeta) {
            onBetaBypass();
            onOpenChange(false);
          } else if (data.clientSecret && data.paymentIntentId) {
            setClientSecret(data.clientSecret);
            setPaymentIntentId(data.paymentIntentId);
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>
            {mailType === "first_class" ? "Send via First Class Mail" : "Send via Registered Mail"}
          </DialogTitle>
          <DialogDescription>
            Complete payment to send this packet securely via Canada Post {mailType === "first_class" ? "First Class Mail" : "Registered Mail"}.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.body}>
          {createIntent.isPending && (
            <div className={styles.loadingState}>
              <Spinner size="md" />
              <p className={styles.loadingText}>Initializing secure payment...</p>
            </div>
          )}

          {createIntent.isError && (
            <div className={styles.errorState}>
              <p className={styles.errorMessage}>
                {createIntent.error instanceof Error
                  ? createIntent.error.message
                  : "Failed to initialize payment."}
              </p>
              <Button variant="outline" onClick={handleRetry}>
                Try Again
              </Button>
            </div>
          )}

          {clientSecret && paymentIntentId && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#1a3dcc",
                    colorBackground: "#ffffff",
                    colorText: "#263044",
                    colorDanger: "#e62e4f",
                    fontFamily: "Inter, system-ui, sans-serif",
                    borderRadius: "8px",
                  },
                },
              }}
            >
              <StripeCheckoutForm
                clientSecret={clientSecret}
                paymentIntentId={paymentIntentId}
                baseCost={baseCost}
                surchargeRate={surchargeRate}
                totalCost={totalCost}
                onPaymentSuccess={onPaymentSuccess}
                onCancel={() => onOpenChange(false)}
              />
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};