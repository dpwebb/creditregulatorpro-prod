import React, { useMemo } from "react";
import { Joyride, EVENTS, EventData, Options, STATUS, Step, Styles } from "react-joyride";
import { useOnboarding } from "../helpers/useOnboarding";
import { useAuth } from "../helpers/useAuth";
import { 
  ShieldCheck, 
  UploadCloud, 
  Rocket,
  ScanSearch,
  Mail
} from "lucide-react";
import styles from "./OnboardingTour.module.css";

/**
 * The interactive tour component for Credit Regulator Pro.
 * It uses react-joyride to guide users through the application.
 * 
 * This tour uses universal, center-positioned steps so it works for all users 
 * regardless of current route or authentication status.
 */
export const OnboardingTour: React.FC = () => {
  const {
    run,
    stepIndex,
    setStepIndex,
    completeTour,
  } = useOnboarding();
  
  const { authState } = useAuth();
  const isAuthenticated = authState.type === "authenticated";

  // Define the steps for the tour using useMemo to react to auth state changes
  const steps: Step[] = useMemo(() => {
    const baseSteps: Step[] = [
      {
        target: "body",
        placement: "center",
        title: (
          <div className={styles.stepTitleWrapper}>
            <ShieldCheck className={styles.stepIcon} size={24} />
            <span>Welcome to Credit Regulator Pro!</span>
          </div>
        ),
        content: (
          <div className={styles.stepContent}>
            <p className={styles.stepSubtitle}>Step 1 of 5</p>
            <p>
              This app helps you check if credit reporting companies are following the rules. We'll walk you through how it works — it's easy!
            </p>
          </div>
        ),
        skipBeacon: true,
      },
      {
        target: "body",
        placement: "center",
        title: (
          <div className={styles.stepTitleWrapper}>
            <UploadCloud className={styles.stepIcon} size={24} />
            <span>Upload Your Credit Report</span>
          </div>
        ),
        content: (
          <div className={styles.stepContent}>
            <p className={styles.stepSubtitle}>Step 2 of 5</p>
            <p>
              Upload your credit report (PDF or HTML). We'll read it and find all your accounts automatically.
            </p>
          </div>
        ),
      },
      {
        target: "body",
        placement: "center",
        title: (
          <div className={styles.stepTitleWrapper}>
            <ScanSearch className={styles.stepIcon} size={24} />
            <span>We Check for Problems</span>
          </div>
        ),
        content: (
          <div className={styles.stepContent}>
            <p className={styles.stepSubtitle}>Step 3 of 5</p>
            <p>
              We check your accounts against Canadian rules. If something looks wrong, we'll flag it for you.
            </p>
          </div>
        ),
      },
      {
        target: "body",
        placement: "center",
        title: (
          <div className={styles.stepTitleWrapper}>
            <Mail className={styles.stepIcon} size={24} />
            <span>Send a Dispute Letter</span>
          </div>
        ),
        content: (
          <div className={styles.stepContent}>
            <p className={styles.stepSubtitle}>Step 4 of 5</p>
            <p>
              We help you write and mail dispute letters. Keep your tracking numbers as proof.
            </p>
          </div>
        ),
      },
    ];

    // Context-aware final step
    const finalStep: Step = {
      target: "body",
      placement: "center",
      title: (
        <div className={styles.stepTitleWrapper}>
          <Rocket className={styles.stepIcon} size={24} />
          <span>You're All Set!</span>
        </div>
      ),
      content: (
        <div className={styles.stepContent}>
          <p className={styles.stepSubtitle}>Step 5 of 5</p>
          {isAuthenticated ? (
            <p>Start by uploading your first report from the Upload page.</p>
          ) : (
            <p>Create your free account to get started.</p>
          )}
        </div>
      ),
    };

    return [...baseSteps, finalStep];
  }, [isAuthenticated, completeTour]);

  const handleJoyrideCallback = (data: EventData) => {
    const { status, type, index, action } = data;

    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      // Tour is finished or skipped
      completeTour();
    } else if (type === EVENTS.STEP_AFTER) {
      // Handle navigation based on which button was clicked
      if (action === "prev") {
        setStepIndex(index - 1);
      } else {
        setStepIndex(index + 1);
      }
    }
  };

  const tourOptions: Partial<Options> = {
    arrowColor: "var(--popup)",
    backgroundColor: "var(--popup)",
    buttons: ["back", "skip", "close", "primary"],
    overlayColor: "rgba(0, 0, 0, 0.6)",
    primaryColor: "var(--primary)",
    showProgress: true,
    textColor: "var(--popup-foreground)",
    width: 480,
    zIndex: 10000,
  };

  // Custom styles to match Credit Regulator Pro Horizon design system
  const tourStyles: Partial<Styles> = {
    tooltip: {
      borderRadius: "var(--radius-lg)",
      fontFamily: "var(--font-family-base)",
      fontSize: "0.95rem",
      padding: "var(--spacing-6)",
      boxShadow: "var(--shadow-lg)",
    },
    tooltipContainer: {
      textAlign: "left",
    },
    tooltipTitle: {
      fontFamily: "var(--font-family-heading)",
      fontSize: "1.2rem",
      fontWeight: 600,
      marginBottom: "var(--spacing-3)",
      color: "var(--foreground)",
    },
    tooltipContent: {
      padding: 0,
      color: "var(--muted-foreground)",
      lineHeight: "1.6",
    },
    buttonPrimary: {
      backgroundColor: "var(--primary)",
      color: "var(--primary-foreground)",
      borderRadius: "var(--radius)",
      padding: "var(--spacing-2) var(--spacing-4)",
      fontSize: "0.875rem",
      fontWeight: 500,
      outline: "none",
      border: "none",
    },
    buttonBack: {
      color: "var(--muted-foreground)",
      marginRight: "var(--spacing-2)",
      fontSize: "0.875rem",
    },
    buttonSkip: {
      color: "var(--muted-foreground)",
      fontSize: "0.875rem",
    },
  };

  return (
    <div className={styles.tourWrapper}>
      <Joyride
        steps={steps}
        run={run}
        stepIndex={stepIndex}
        continuous
        scrollToFirstStep
        options={tourOptions}
        styles={tourStyles}
        onEvent={handleJoyrideCallback}
        locale={{
          last: "Done",
          next: "Next",
          back: "Back",
          skip: "Skip Tour",
        }}
      />
    </div>
  );
};
