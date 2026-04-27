import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./AppSidebarToggle.module.css";

interface AppSidebarToggleProps {
  isMinimized: boolean;
  onToggle: () => void;
  className?: string;
}

export const AppSidebarToggle: React.FC<AppSidebarToggleProps> = ({
  isMinimized,
  onToggle,
  className,
}) => {
  return (
    <button
      onClick={onToggle}
      className={`${styles.toggleButton} ${className || ""}`}
      aria-label={isMinimized ? "Expand sidebar" : "Collapse sidebar"}
      title={isMinimized ? "Expand sidebar" : "Collapse sidebar"}
    >
      {isMinimized ? (
        <ChevronRight size={18} />
      ) : (
        <ChevronLeft size={18} />
      )}
    </button>
  );
};