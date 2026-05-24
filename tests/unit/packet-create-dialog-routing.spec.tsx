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
  readinessByIssueId: {} as Record<number, any>,
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
  usePacketReadiness: (input: { selectedIssueIds: number[] }) => ({
    data: mocks.readinessByIssueId[input.selectedIssueIds[0]] ?? {
      packetReady: false,
      blockers: [
        {
          findingId: input.selectedIssueIds[0],
          code: "MISSING_REQUIRED_EVIDENCE",
          message: "Required source-report evidence is missing for this finding.",
        },
      ],
      warnings: [],
      eligibleFindingIds: [],
      ineligibleFindingIds: input.selectedIssueIds,
      reasonCodes: ["MISSING_REQUIRED_EVIDENCE"],
    },
    isFetching: false,
    error: null,
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

const forbiddenConsumerPacketOutput =
  /tradeline|artifact|report artifact|source report #|field:|PIPEDA_|BALANCE_CALCULATION_VIOLATION|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z|LasReportedDate|Lastreporteddate|lastReportedDate|sourceReportArtifactId|reportArtifactId|tradelineId|Account ending reau|Expected:\s*Not known|PDF rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|internal render|system diagnostic/i;

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
    credit_bureau: [candidate(42), candidate(43, "Cedar Loan")],
    collection_agency: [],
  };
  mocks.readinessByIssueId = {};
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

  it("opens /packets?create=true&issueId with only the originating packet-ready finding available", async () => {
    mocks.createPacket.mockResolvedValueOnce({
      packetId: 88,
      packet: {} as any,
      status: "generated",
    });

    renderPacketsPage("/packets?create=true&issueId=42");

    expect(await screen.findByText("Create Letter for Selected Problem")).toBeInTheDocument();
    expect(screen.getByText("Selected Problem")).toBeInTheDocument();
    expect(screen.getByText(/Maple Bank Visa/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cedar Loan/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Maple Bank Visa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/This finding is not packet-ready yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate PDF" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate PDF" }));

    await waitFor(() => {
      expect(mocks.createPacket).toHaveBeenCalledWith({
        packetType: "credit_bureau",
        selectedIssueIds: [42],
        recipient: undefined,
      });
    });
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
    expect(previewText).toContain("Subject: Dispute of Credit Report Information");
    expect(previewText).toContain("To Whom It May Concern,");
    expect(previewText).toContain("credit report dated Aug 21, 2012");
    expect(previewText).toContain("Creditor/Reporter: Rogers Communications");
    expect(previewText).toContain("Account Number: Account number not shown on report");
    expect(previewText).toContain("Date Reported / Last Activity: Date last reported: Aug 21, 2012");
    expect(previewText).toContain("The balance being reported does not appear accurate based on my records.");
    expect(previewText).toContain("Evidence summary");
    expect(previewText).toContain("Attachment checklist");
    expect(previewText).not.toContain("Rogers Communications: LasReportedDate - verify and provide basis");
    expect(previewText).not.toMatch(forbiddenConsumerPacketOutput);
  });

  it("does not preselect a missing or ineligible originating finding", async () => {
    renderPacketsPage("/packets?create=true&issueId=99");

    expect(await screen.findByText("Create Letter for Selected Problem")).toBeInTheDocument();
    expect(await screen.findByText("This problem needs review before a letter can be created.")).toBeInTheDocument();
    expect(screen.getByText(/Source-report evidence needs to be linked to this problem/i)).toBeInTheDocument();
    expect(screen.getByText(/You or support can review the account details/i)).toBeInTheDocument();
    expect(screen.getByText(/Open the account, confirm the report section that supports the problem, then verify the problem/i)).toBeInTheDocument();
    expect(screen.queryByText(/readiness blockers|packet-ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Maple Bank Visa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cedar Loan/i)).not.toBeInTheDocument();
  });

  it("explains who reviews extraction issues without exposing internal reason codes", async () => {
    mocks.readinessByIssueId[99] = {
      packetReady: false,
      blockers: [
        {
          findingId: 99,
          code: "PARSER_UNCERTAIN",
          message: "Parser-uncertain findings need parser review before packet creation.",
        },
      ],
      warnings: [],
      eligibleFindingIds: [],
      ineligibleFindingIds: [99],
      reasonCodes: ["PARSER_UNCERTAIN"],
    };

    renderPacketsPage("/packets?create=true&issueId=99");

    expect(await screen.findByText("Create Letter for Selected Problem")).toBeInTheDocument();
    expect(screen.getByText(/The report text extraction needs review/i)).toBeInTheDocument();
    expect(screen.getByText(/Support needs to review the extracted account details/i)).toBeInTheDocument();
    expect(screen.getByText(/Support corrects or approves the extracted details/i)).toBeInTheDocument();
    expect(screen.queryByText(/PARSER_UNCERTAIN|parser-uncertain|packet creation/i)).not.toBeInTheDocument();
  });

  it("does not render the response timeline when no response records exist", () => {
    renderPacketsPage("/packets");

    expect(screen.queryByRole("region", { name: /dispute replies/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Replies will appear/i)).not.toBeInTheDocument();
  });

  it("renders response replies with plain-language review guidance", () => {
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

    expect(screen.getByRole("region", { name: /dispute replies/i })).toBeInTheDocument();
    expect(screen.getByText("Replies Received")).toBeInTheDocument();
    expect(screen.getByText("Response needs review")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Bureau email reply")).toBeInTheDocument();
    expect(screen.getByText(/Support will review it, or it can be compared with a newer credit report/i)).toBeInTheDocument();
    expect(screen.queryByText(/83% confidence|Intake classification only|deterministic|safe comparison|admin review/i)).not.toBeInTheDocument();
  });
});
