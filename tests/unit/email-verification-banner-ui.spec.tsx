import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  authState: { type: "authenticated", user: null as any } as any,
  logout: vi.fn(),
  sendVerificationEmail: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("../../helpers/useAuth", () => ({
  useAuth: () => ({
    authState: mocks.authState,
    logout: mocks.logout,
    isAdmin: mocks.authState.type === "authenticated" && mocks.authState.user.role === "admin",
    userRole: mocks.authState.type === "authenticated" ? mocks.authState.user.role : null,
  }),
}));

vi.mock("../../helpers/useEmailVerification", () => ({
  useRequestVerificationEmail: () => ({
    mutate: mocks.sendVerificationEmail,
    isPending: false,
  }),
}));

vi.mock("../../helpers/useToast", () => ({
  useToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
  }),
}));

vi.mock("../../helpers/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("../../helpers/versionQueries", () => ({
  useCurrentVersion: () => ({ data: { version: "test" } }),
}));

vi.mock("../../components/AppSidebarNavigation", () => ({
  AppSidebarNavigation: () => <nav aria-label="sidebar" />,
}));

vi.mock("../../components/AppSidebarUser", () => ({
  AppSidebarUser: () => <div data-testid="sidebar-user" />,
}));

vi.mock("../../components/AppSidebarToggle", () => ({
  AppSidebarToggle: () => <button type="button" aria-label="toggle sidebar" />,
}));

vi.mock("../../components/AppSidebarPlatformFunctionsButton", () => ({
  AppSidebarPlatformFunctionsButton: () => <button type="button">Platform</button>,
}));

vi.mock("../../components/TrialCountdownBanner", () => ({
  TrialCountdownBanner: () => null,
}));

vi.mock("../../components/AISupportChat", () => ({
  AISupportChat: () => null,
}));

import { AppLayout } from "../../components/AppLayout";

function user(emailVerified: boolean) {
  return {
    id: 10,
    email: "synthetic.user@example.invalid",
    displayName: "Synthetic User",
    avatarUrl: null,
    organizationId: null,
    emailVerified,
    role: "user",
    subscriptionPlan: "basic",
    subscriptionStatus: "active",
    trialEnd: null,
    termsAcceptedAt: "2026-01-01T00:00:00.000Z",
    termsAcceptedVersion: "terms-v1",
    currentTermsVersion: "terms-v1",
  };
}

function renderLayout(emailVerified: boolean) {
  mocks.authState = {
    type: "authenticated",
    user: user(emailVerified),
  };

  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppLayout>
        <div>Dashboard content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("email verification banner", () => {
  it("does not show the important-updates notice for verified users", () => {
    renderLayout(true);

    expect(
      screen.queryByText("We need to check your email. Click the button so we can send you important updates."),
    ).not.toBeInTheDocument();
  });

  it("shows the important-updates notice for genuinely unverified users", () => {
    renderLayout(false);

    expect(
      screen.getByText("We need to check your email. Click the button so we can send you important updates."),
    ).toBeInTheDocument();
  });
});
