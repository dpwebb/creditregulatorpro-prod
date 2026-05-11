import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DisputePacketCandidate } from "../../helpers/disputePacketService";

const mocks = vi.hoisted(() => ({
  recommendationsByType: {} as Record<string, DisputePacketCandidate[]>,
  deletePacketMutation: vi.fn(),
  updateStatus: vi.fn(),
  buildPacketPreview: vi.fn(),
  createPacket: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("../../helpers/packetQueries", () => ({
  usePacketList: () => ({
    data: { packets: [] },
    isFetching: false,
    error: null,
  }),
  useDeletePacket: () => ({
    mutateAsync: mocks.deletePacketMutation,
  }),
  usePacketRecommendations: (packetType: string) => ({
    data: { recommendations: mocks.recommendationsByType[packetType] ?? [] },
    isFetching: false,
  }),
  useBuildPacketPreview: () => ({
    mutateAsync: mocks.buildPacketPreview,
    isPending: false,
  }),
  useCreatePacket: () => ({
    mutateAsync: mocks.createPacket,
    isPending: false,
  }),
}));

vi.mock("../../helpers/useUpdatePacketStatus", () => ({
  useUpdatePacketStatus: () => ({
    mutate: mocks.updateStatus,
  }),
}));

vi.mock("../../helpers/useToast", () => ({
  useToast: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
  }),
}));

vi.mock("../../helpers/useAuth", () => ({
  useAuth: () => ({
    isAdmin: false,
  }),
}));

vi.mock("../../components/DeliveryWizard", () => ({
  DeliveryWizard: () => null,
}));

import PacketsPage, { parseInitialPacketIssueId } from "../../pages/packets";
import { buildCreatePacketRouteForFinding } from "../../components/TradelineComplianceHub";

function candidate(issueId: number, name = "Maple Bank Visa"): DisputePacketCandidate {
  return {
    issueId,
    tradelineId: 10,
    userId: 20,
    userEmail: null,
    userDisplayName: null,
    packetTypes: ["credit_bureau"],
    bureauName: "TransUnion Canada",
    creditorCollectorName: name,
    collectionAgencyName: null,
    maskedAccountNumber: "****1234",
    issueType: "Balance mismatch",
    explanation: "Balance differs from source report.",
    evidenceReference: "Source report #7; field: balance; page 2",
    requestedAction: "correct balance",
    needsManualReview: false,
    reportDate: "2026-05-11",
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPacketsPage(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PacketsPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recommendationsByType = {
    credit_bureau: [candidate(42)],
    collection_agency: [],
  };
});

describe("packet create dialog routing", () => {
  it("builds originating finding Create Packet routes with issueId", () => {
    expect(buildCreatePacketRouteForFinding(42)).toBe("/packets?create=true&issueId=42");
  });

  it("parses valid packet-create issueId query params only", () => {
    expect(parseInitialPacketIssueId(new URLSearchParams("create=true&issueId=42"))).toBe(42);
    expect(parseInitialPacketIssueId(new URLSearchParams("create=true&issueId=0"))).toBeNull();
    expect(parseInitialPacketIssueId(new URLSearchParams("create=true&issueId=abc"))).toBeNull();
    expect(parseInitialPacketIssueId(new URLSearchParams("create=true"))).toBeNull();
  });

  it("keeps /packets?create=true opening the generic packet dialog", async () => {
    renderPacketsPage("/packets?create=true");

    expect(await screen.findByText("Create Dispute Packet")).toBeInTheDocument();
    expect(screen.queryByText(/This finding is not packet-ready yet/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Maple Bank Visa/i)).not.toBeChecked();
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe(""));
  });

  it("opens /packets?create=true&issueId with the matching packet-ready finding preselected", async () => {
    renderPacketsPage("/packets?create=true&issueId=42");

    expect(await screen.findByText("Create Dispute Packet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Maple Bank Visa/i)).toBeChecked());
    expect(screen.queryByText(/This finding is not packet-ready yet/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toBe(""));
  });

  it("does not preselect a missing or ineligible originating finding", async () => {
    renderPacketsPage("/packets?create=true&issueId=99");

    expect(await screen.findByText("Create Dispute Packet")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "This finding is not packet-ready yet. Review the readiness blockers before creating a packet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Maple Bank Visa/i)).not.toBeChecked();
  });
});
