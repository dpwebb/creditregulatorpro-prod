import React, { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./StripeCheckoutForm.module.css";

interface StripeCheckoutFormProps {
  clientSecret: string;
  paymentIntentId: string;
  baseCost: number;
  surchargeRate: number;
  totalCost: number;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

const percentFormatter = new Intl.NumberFormat("en-CA", {
  style: "percent",
});

export const StripeCheckoutForm: React.FC<StripeCheckoutFormProps> = ({
  clientSecret,
  paymentIntentId,
  baseCost,
  surchargeRate,
  totalCost,
  onPaymentSuccess,
  onCancel,
}) => {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // Required step: trigger form validation and wallet collection before confirmPayment
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message || "Please check your payment details.");
      setIsProcessing(false);
      return;
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        // Return URL is omitted because we use redirect: "if_required"
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message || "An unexpected error occurred during payment.");
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onPaymentSuccess(paymentIntentId);
    } else {
      setErrorMessage("Payment status is incomplete or unexpected.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.breakdown}>
        <div className={styles.row}>
          <span className={styles.label}>Base Registered Mail Cost</span>
          <span className={styles.value}>{cadFormatter.format(baseCost)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>
            Processing Surcharge ({percentFormatter.format(surchargeRate)})
          </span>
          <span className={styles.value}>
            {cadFormatter.format(totalCost - baseCost)}
          </span>
        </div>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Total CAD</span>
          <span className={styles.totalValue}>{cadFormatter.format(totalCost)}</span>
        </div>
      </div>

      <div className={styles.paymentElementContainer}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {errorMessage && (
        <div className={styles.error} role="alert">
          {errorMessage}
        </div>
      )}

      <div className={styles.actions}>
        <Button
          variant="outline"
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isProcessing || !stripe || !elements}>
          {isProcessing ? (
            <>
              <Spinner size="sm" />
              Processing...
            </>
          ) : (
            `Pay ${cadFormatter.format(totalCost)}`
          )}
        </Button>
      </div>
    </form>
  );
};