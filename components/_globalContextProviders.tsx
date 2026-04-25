import React, { ReactNode, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../helpers/useAuth";
import { OnboardingProvider } from "../helpers/useOnboarding";

const OnboardingTour = React.lazy(() => import("./OnboardingTour").then(m => ({ default: m.OnboardingTour })));
import { TooltipProvider } from "./Tooltip";
import { SonnerToaster } from "./SonnerToaster";
import { ScrollToHashElement } from "./ScrollToHashElement";
import { Helmet } from "react-helmet";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute “fresh” window
    },
  },
});

export const GlobalContextProviders = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <OnboardingProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ScrollToHashElement />
          <TooltipProvider>
            <Helmet>
              <link rel="manifest" href="/manifest.json" />
              <meta name="theme-color" content="#1a365d" />
              <link
                rel="apple-touch-icon"
                href="https://assets.floot.app/e11b9956-edbd-4f31-b22c-500fa8dbcb00/967b6935-5d10-4536-8541-99a1482773d7.png"
              />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta
                name="apple-mobile-web-app-status-bar-style"
                content="black-translucent"
              />
              <meta name="apple-mobile-web-app-title" content="Credit Regulator Pro" />
            </Helmet>
            <Suspense fallback={null}>
              <OnboardingTour />
            </Suspense>
            {children}
            <SonnerToaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </OnboardingProvider>
  );
};
