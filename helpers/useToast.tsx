import { toast, ExternalToast } from "sonner";
import {
  CheckCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback } from "react";
import styles from "./useToast.module.css";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastOptions = {
  /** Duration in milliseconds. Defaults to 4000ms for normal, 8000ms for errors/warnings */
  duration?: number;
  /** An optional action button to display */
  action?: ToastAction;
  /** An optional undo action. If provided, it renders as a button. */
  undo?: () => void;
  /** If provided, clicking the toast (or a specific link part) will navigate here */
  navigateTo?: string;
  /** Custom description/subtitle */
  description?: string;
};

/**
 * A hook that provides enhanced toast notification methods.
 * Wraps 'sonner' with consistent styling and icons for the Credit Regulator Pro design system.
 */
export const useToast = () => {
  const navigate = useNavigate();

  const showSuccess = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { duration = 4000, action, undo, navigateTo, description } = options;

      toast.success(message, {
        duration,
        description,
        className: styles.successToast,
        icon: <CheckCircle className={styles.iconSuccess} size={20} />,
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : navigateTo
            ? {
                label: "View",
                onClick: () => navigate(navigateTo),
              }
            : undo
              ? {
                  label: "Undo",
                  onClick: undo,
                }
              : undefined,
      });
    },
    [navigate]
  );

  const showError = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { duration = 8000, action, navigateTo, description } = options;

      toast.error(message, {
        duration,
        description,
        className: styles.errorToast,
        icon: <XCircle className={styles.iconError} size={20} />,
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : navigateTo
            ? {
                label: "View",
                onClick: () => navigate(navigateTo),
              }
            : undefined,
      });
    },
    [navigate]
  );

  const showWarning = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { duration = 6000, action, navigateTo, description } = options;

      toast.warning(message, {
        duration,
        description,
        className: styles.warningToast,
        icon: <AlertTriangle className={styles.iconWarning} size={20} />,
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : navigateTo
            ? {
                label: "View",
                onClick: () => navigate(navigateTo),
              }
            : undefined,
      });
    },
    [navigate]
  );

  const showInfo = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const { duration = 5000, action, navigateTo, description } = options;

      toast.info(message, {
        duration,
        description,
        className: styles.infoToast,
        icon: <Info className={styles.iconInfo} size={20} />,
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : navigateTo
            ? {
                label: "View",
                onClick: () => navigate(navigateTo),
              }
            : undefined,
      });
    },
    [navigate]
  );

  return {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    // Expose raw toast for custom needs
    toast,
  };
};