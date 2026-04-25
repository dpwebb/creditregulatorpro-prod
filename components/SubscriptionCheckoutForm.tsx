import React, { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./SubscriptionCheckoutForm.module.css";

interface SubscriptionCheckoutFormProps {
  plan: "monthly" | "annual";
  clientSecret: string;
  onPaymentSuccess: () => void;
  onCancel: () => void;
}

const planDetails = {
  monthly: {
    label: "Monthly Plan",
    price: 19.00,
    interval: "mo",
  },
  annual: {
    label: "Annual Plan",
    price: 49.99,
    interval: "yr",
  },
};

const cadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

export const SubscriptionCheckoutForm: React.FC<SubscriptionCheckoutFormProps> = ({
  plan,
  clientSecret,
  onPaymentSuccess,
  onCancel,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPlan = planDetails[plan];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    // Trigger form validation and wallet collection before confirmPayment
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
        // Return URL omitted due to redirect: "if_required"
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message || "An unexpected error occurred during payment.");
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onPaymentSuccess();
    } else {
      setErrorMessage("Payment setup is incomplete or unexpected status.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.breakdown}>
        <div className={styles.planHeader}>
          <span className={styles.planLabel}>{selectedPlan.label}</span>
          <span className={styles.planPrice}>
            {cadFormatter.format(selectedPlan.price)}<span className={styles.interval}>/{selectedPlan.interval}</span>
          </span>
        </div>
        
        <div className={styles.trialNotice}>
          <div className={styles.trialBadge}>7-Day Free Trial</div>
          <span className={styles.trialText}>First charge occurs after your 7-day trial ends</span>
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
            "Start Free Trial"
          )}
        </Button>
      </div>
    </form>
  );
};