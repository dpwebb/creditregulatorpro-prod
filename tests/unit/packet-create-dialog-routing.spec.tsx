import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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
  responseDocuments: [] as any[],
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

vi.mock("../../helpers/responseDocumentQueries", () => ({
  useResponseDocuments: () => ({
    data: { responses: mocks.responseDocuments, total: mocks.responseDocuments.length },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// Routing behavior does not exercise PDF rendering; keep CI out of pdfjs' CJS/TLA boundary.
vi.mock("@react-pdf-viewer/core", () => ({
  Worker: ({ children }: { children?: ReactNode }) => children ?? null,
  Viewer: () => null,
}));

vi.mock("@react-pdf-viewer/default-layout", () => ({
  defaultLayoutPlugin: () => ({}),
}));

vi.mock("@react-pdf-viewer/search", () => ({
  searchPlugin: () => ({}),
}));

vi.mock("../../components/PacketViewer", () => ({
  PacketViewer: () => null,
}));

vi.mock("../../components/SourceReportViewer", () => ({
  SourceReportViewer: () => null,
}));

vi.mock("../../components/DeliveryWizard", () => ({
  DeliveryWizard: () => null,
}));

import PacketsPage, { parseInitialPacketIssueId } from "../../pages/packets";
import { buildCreatePacketRouteForFinding } from "../../components/TradelineComplianceHub";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";

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
  mocks.responseDocuments = [];
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

  it("allows generating a PDF after selecting a packet-ready finding without forcing a preview first", async () => {
    mocks.createPacket.mockResolvedValueOnce({
      packetId: 88,
      packet: {} as any,
      status: "generated",
    });

    renderPacketsPage("/packets?create=true");

    expect(await screen.findByText("Create Dispute Packet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate PDF" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Maple Bank Visa/i));

    expect(screen.getByRole("button", { name: "Generate PDF" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate PDF" }));

    await waitFor(() => {
      expect(mocks.createPacket).toHaveBeenCalledWith({
        packetType: "credit_bureau",
        selectedIssueIds: [42],
        recipient: undefined,
      });
    });
    expect(mocks.showSuccess).toHaveBeenCalledWith("Packet generated");
  });

  it("shows the recipient-facing packet preview instead of compact internal finding text", async () => {
    const packet = buildSimpleDisputePacketContent({
      packetType: "credit_bureau",
      reportType: "TransUnion report artifact #77",
      reportDate: "2012-08-21T00:00:00.000Z",
      dateGenerated: "2026-05-21T00:00:00.000Z",
      recipient: {
        type: "credit_bureau",
        name: "TransUnion Canada",
        address: ["Consumer Relations"],
      },
      consumer: {
        name: "Test Consumer",
        address: ["1 Main St", "Halifax, NS B3H 0A1"],
        email: "test@example.com",
      },
      disputedItems: [
        {
          issueId: 42,
          tradelineId: 222,
          creditorCollectorName: "Rogers Communications",
          accountNumber: "reau",
          disputedField: "LasReportedDate",
          reportedValue: "2012-08-21T00:00:00.000Z",
          expectedValue: "Not known",
          issueType: "BALANCE_CALCULATION_VIOLATION",
          explanation: "PIPEDA_4_5 source report #77 field: LasReportedDate tradelineId: 222",
          evidenceReference: "reportArtifactId: 77; tradelineId: 222; field: LasReportedDate; page 4",
        },
      ],
      reportArtifactIds: [77],
      generatedByUserId: 20,
    });
    packet.metadata.internalReferences = [
      {
        findingId: 42,
        violationId: 9001,
        tradelineId: 222,
        reportArtifactId: 77,
        evidenceIds: ["evidence-raw-77"],
        regulationIds: ["PIPEDA_4_5"],
        ruleIds: ["BALANCE_CALCULATION_VIOLATION"],
        fieldKey: "LasReportedDate",
        sourceField: "sourceReportArtifactId",
        readiness: { packetReady: true },
      },
    ];
    packet.attachmentChecklist.push("Source report #77; field: LasReportedDate; artifact ID 77");
    mocks.buildPacketPreview.mockResolvedValueOnce({ packet });

    renderPacketsPage("/packets?create=true");

    expect(await screen.findByText("Create Dispute Packet")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Maple Bank Visa/i));
    fireEvent.click(screen.getByRole("button", { name: "Preview Packet" }));

    const preview = await screen.findByRole("region", { name: "Recipient-facing packet preview" });
    const previewText = preview.textContent ?? "";

    expect(previewText).toContain("TransUnion Canada");
    expect(previewText).toContain("Consumer:");
    expect(previewText).toContain("Credit report reviewed:");
    expect(previewText).toContain("Disputed Account");
    expect(previewText).toContain("Company reporting the account: Rogers Communications");
    expect(previewText).toContain("Account: Account identifier unavailable");
    expect(previewText).toContain("Information disputed: Date last reported");
    expect(previewText).toContain("Reported value: Aug 21, 2012");
    expect(previewText).toContain("Reason for dispute:");
    expect(previewText).toContain("Requested action:");
    expect(previewText).toContain("Evidence summary");
    expect(previewText).toContain("Attachment checklist");
    expect(previewText).not.toContain("Rogers Communications: LasReportedDate - verify and provide basis");
    expect(previewText).not.toMatch(/tradeline|artifact|source report|field:|PIPEDA_|2012-08-21T|LasReportedDate|sourceReportArtifactId|Account ending reau|Expected:\s*Not known/i);
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

  it("does not render the response timeline when no response records exist", () => {
    renderPacketsPage("/packets");

    expect(screen.queryByRole("region", { name: /response timeline/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorded responses will appear/i)).not.toBeInTheDocument();
  });

  it("renders response timeline only for existing response records with uncertainty visible", () => {
    mocks.responseDocuments = [
      {
        id: 77,
        packetId: 55,
        responseReceivedAt: "2026-05-18T12:00:00.000Z",
        responseDocumentType: "bureau_email_response",
        latestClassification: "remains",
        latestClassificationConfidence: 0.83,
        latestExtractionSource: "deterministic",
        latestRequiresManualReview: true,
      },
    ];

    renderPacketsPage("/packets");

    expect(screen.getByRole("region", { name: /response timeline/i })).toBeInTheDocument();
    expect(screen.getByText("Response says item remains")).toBeInTheDocument();
    expect(screen.getByText("83% confidence")).toBeInTheDocument();
    expect(screen.getByText("Intake classification only")).toBeInTheDocument();
    expect(screen.getByText(/unresolved and will stay in review/i)).toBeInTheDocument();
  });
});
