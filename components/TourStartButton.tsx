import React from "react";
import { HelpCircle, Compass } from "lucide-react";
import { useOnboarding } from "../helpers/useOnboarding";
import { Button } from "./Button";
import styles from "./TourStartButton.module.css";

interface TourStartButtonProps {
  /** The visual style of the button */
  variant?: "default" | "outline" | "ghost" | "link" | "secondary";
  /** The size of the button */
  size?: "sm" | "md" | "lg";
  /** Whether to show the help icon */
  showIcon?: boolean;
  /** Custom label for the button. If not provided, defaults based on completion status. */
  label?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A reusable button component that triggers the application onboarding tour.
 * It contextually changes its label based on whether the user has completed the tour before.
 */
export const TourStartButton: React.FC<TourStartButtonProps> = ({
  variant = "outline",
  size = "md",
  showIcon = true,
  label,
  className,
}) => {
  const { startTour, isCompleted } = useOnboarding();

  // Determine the default label based on completion status
  const defaultLabel = isCompleted ? "Take Tour Again" : "Take a Tour";
  const finalLabel = label ?? defaultLabel;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={startTour}
      className={`${styles.tourButton} ${className || ""}`}
      title={finalLabel}
    >
      {showIcon && (
        <span className={styles.iconWrapper}>
          {isCompleted ? (
            <Compass className={styles.icon} />
          ) : (
            <HelpCircle className={styles.icon} />
          )}
        </span>
      )}
      <span>{finalLabel}</span>
    </Button>
  );
};