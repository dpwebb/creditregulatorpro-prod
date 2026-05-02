import React, { useState } from "react";
import { useSubscription, useCancelSubscription } from "../helpers/subscriptionQueries";
import { useSystemSettings, useSubscriptionPricing } from "../helpers/useSystemSettings";
import { useAuth } from "../helpers/useAuth";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import { useToast } from "../helpers/useToast";
import { SubscriptionUpgradeDialog } from "./SubscriptionUpgradeDialog";
import { getSubscriptionPlanLabel } from "../helpers/subscriptionPlanLabels";
import styles from "./SubscriptionSection.module.css";

export const SubscriptionSection = () => {
  const { authState } = useAuth();
  const { subscription, isLoading, isBeta: isTrialUser, isActive, isTrialing, daysLeftInTrial } = useSubscription();
  const cancelMutation = useCancelSubscription();
  const { data: settings, isLoading: isSettingsLoading } = useSystemSettings();
  const { monthlyPrice, annualPrice, isLoading: isPricingLoading } = useSubscriptionPricing();
  const { showSuccess, showError } = useToast();

  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual" | null>(null);

  if (authState.type === "authenticated" && authState.user.role === "admin") {
    return null;
  }

  if (isLoading || isSettingsLoading || isPricingLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h3 className={styles.title}>Subscription</h3>
        </div>
        <Skeleton style={{ height: "100px" }} />
      </div>
    );
  }

  if (!subscription) {
    return null;
  }

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ reason: "User requested cancellation" });
      showSuccess("Subscription cancelled successfully");
    } catch (e) {
      showError("Failed to cancel subscription");
    }
  };

  const handleUpgradeClick = (plan: "monthly" | "annual") => {
    setSelectedPlan(plan);
    setUpgradeDialogOpen(true);
  };

  const renderUpgradeButton = (planOption: "monthly" | "annual") => {
    if (subscription.plan === planOption && isActive) {
      return (
        <Button variant="outline" disabled>
          Current Plan
        </Button>
      );
    }

    return (
      <Button variant="outline" onClick={() => handleUpgradeClick(planOption)}>
        Upgrade
      </Button>
    );
  };

  const getStatusBadge = () => {
    switch (subscription.status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "trialing":
        return <Badge variant="info">Trialing</Badge>;
      case "past_due":
        return <Badge variant="warning">Past Due</Badge>;
      case "cancelled":
        return <Badge variant="default">Cancelled</Badge>;
      case "expired":
        return <Badge variant="error">Expired</Badge>;
      default:
        return <Badge>{subscription.status}</Badge>;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Subscription</h3>
        <div className={styles.badges}>
          <Badge variant="primary" className={styles.planBadge}>
            {getSubscriptionPlanLabel(subscription.plan)} Plan
          </Badge>
          {getStatusBadge()}
        </div>
      </div>

      <div className={styles.content}>
        {isTrialUser && (
          <p className={styles.message}>
            You're on the Trial User plan. Upgrade anytime to keep using all features.
          </p>
        )}

        {isTrialing && (
          <p className={styles.message}>
            You have {daysLeftInTrial} days left in your 7-day free trial. Subscribe to a paid plan before your trial ends to keep using Credit Regulator Pro.
          </p>
        )}

        {isActive && !isTrialUser && subscription.currentPeriodEnd && (
          <p className={styles.message}>
            Your next billing date is <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>.
          </p>
        )}

        <div className={styles.pricing}>
          <div className={styles.planOption}>
            <div>
              <h4>Monthly</h4>
              <p>${monthlyPrice.toFixed(2)} CAD / month</p>
            </div>
            {renderUpgradeButton("monthly")}
          </div>

          <div className={styles.planOption}>
            <div>
              <h4>Annual</h4>
              <p>${annualPrice.toFixed(2)} CAD / year</p>
            </div>
            {renderUpgradeButton("annual")}
          </div>
        </div>

        {!isTrialUser && isActive && subscription.status !== "cancelled" && (
          <div className={styles.actions}>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Subscription"}
            </Button>
          </div>
        )}
      </div>

      {selectedPlan && (
        <SubscriptionUpgradeDialog
          open={upgradeDialogOpen}
          plan={selectedPlan}
          onOpenChange={setUpgradeDialogOpen}
        />
      )}
    </div>
  );
};
