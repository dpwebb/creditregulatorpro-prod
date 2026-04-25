import React from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";
import styles from "./HelpTooltip.module.css";

interface HelpTooltipProps {
  /** The content to display inside the tooltip */
  content: React.ReactNode;
  /** Optional title for the tooltip */
  title?: string;
  /** Optional className for the trigger icon */
  className?: string;
  /** Size of the help icon. Defaults to 16 */
  size?: number;
  /** Side preference */
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * A contextual help component that renders a small question mark icon.
 * When hovered or clicked, it displays a tooltip with helpful information.
 * Useful for form labels, complex metrics, or terminology explanations.
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  content,
  title,
  className,
  size = 16,
  side = "top",
}) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`${styles.trigger} ${className || ""}`}
            aria-label="More information"
            onClick={(e) => e.preventDefault()} // Prevent form submission if inside a form
          >
            <HelpCircle size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className={styles.content}>
          {title && <div className={styles.title}>{title}</div>}
          <div className={styles.body}>{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};