import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface OnboardingContextType {
  /** Whether the tour is currently active/running */
  run: boolean;
  /** The current step index (0-based) */
  stepIndex: number;
  /** Whether the user has completed the tour previously */
  isCompleted: boolean;
  /** Start the tour manually (e.g. from a help menu) */
  startTour: () => void;
  /** Stop the tour */
  stopTour: () => void;
  /** Mark the tour as completed and stop it */
  completeTour: () => void;
  /** Reset the tour history (useful for testing) */
  resetTour: () => void;
  /** Update the current step index */
  setStepIndex: (index: number) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(
  undefined
);

const STORAGE_KEY = "crp-onboarding-completed";

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIsCompleted(true);
    }
    // Auto-start logic removed as per requirements.
    // The tour is now strictly opt-in via manual trigger.
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setRun(true);
    // Note: We intentionally allow startTour even if isCompleted is true,
    // so users can restart the tour anytime.
  }, []);

  const stopTour = useCallback(() => {
    setRun(false);
  }, []);

  const completeTour = useCallback(() => {
    setRun(false);
    setIsCompleted(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const resetTour = useCallback(() => {
    setRun(false);
    setStepIndex(0);
    setIsCompleted(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Don't render children until we've checked localStorage to prevent flash of content
  // or race conditions, although for a provider it's usually fine to render immediately.
  // We'll render immediately but 'run' state handles the tour visibility.

  return (
    <OnboardingContext.Provider
      value={{
        run,
        stepIndex,
        isCompleted,
        startTour,
        stopTour,
        completeTour,
        resetTour,
        setStepIndex,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = (): OnboardingContextType => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
};