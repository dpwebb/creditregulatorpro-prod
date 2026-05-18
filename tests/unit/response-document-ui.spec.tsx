import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useResponseDocuments: vi.fn(),
  useResponseDocument: vi.fn(),
  refetchResponses: vi.fn(),
  listResponse: null as any,
  detailResponse: null as any,
}));

vi.mock("../../helpers/responseDocumentQueries", () => ({
  useResponseDocuments: mocks.useResponseDocuments,
  useResponseDocument: mocks.useResponseDocument,
}));

import { AdminRoute } from "../../components/ProtectedRoute";
import AdminResponseDocumentsPage from "../../pages/admin-response-documents";
import pageLayout from "../../pages/admin-response-documents.pageLayout";

const responseRecord = {
  id: 901,
  userId: 11,
  packetId: 21,
  disputePacketFindingId: 22,
  findingOutcomeId: 23,
  comparisonRunId: 24,
  bureauId: 25,
  agencyId: null,
  responseChannel: "email",
  responseDocumentType: "bureau_email_response",
  responseReceivedAt: "2026-05-18T12:00:00.000Z",
  responseSource: "manual_record",
  responseSubject: "OUTCOME_SMOKE_SAFE_SUBJECT",
  responseSenderDomain: "example.test",
  responseReferenceId: "OUTCOME_SMOKE_REF",
  attachmentEvidenceId: 26,
  evidenceAttachmentId: 27,
  normalizedResponseHash: "a".repeat(64),
  responseSummary: "Synthetic response recorded as evidence metadata.",
  responseStatus: "linked_to_outcome",
  createdBy: 11,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: "2026-05-18T12:01:00.000Z",
  updatedAt: "2026-05-18T12:01:00.000Z",
};

const unsafeDetailResponse = {
  ...responseRecord,
  responseSubject: "Account number 1234567890123456 raw report text SHOULD_NOT_RENDER_RAW_REPORT_TEXT",
  responseReferenceId: "ref-1234567890123456",
  responseSummary:
    "full email body packet body raw pdf text s3://secret/path?x-goog-signature=secret database_url=postgres://secret",
  reviewNotes: "The bureau violated the law and this proves correction.",
};

function resetHookMocks() {
  mocks.listResponse = responseRecord;
  mocks.detailResponse = responseRecord;
  mocks.refetchResponses.mockResolvedValue(undefined);
  mocks.useResponseDocuments.mockImplementation((filters: unknown) => ({
    data: { responses: mocks.listResponse ? [mocks.listResponse] : [], total: mocks.listResponse ? 1 : 0 },
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mocks.refetchResponses,
    filters,
  }));
  mocks.useResponseDocument.mockImplementation((responseId: number | null) => ({
    data: responseId ? { response: mocks.detailResponse } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetHookMocks();
});

describe("admin response document UI", () => {
  it("uses the admin route layout and renders the Response Documents page", () => {
    expect(pageLayout[0]).toBe(AdminRoute);

    render(<AdminResponseDocumentsPage />);

    expect(screen.getByRole("heading", { name: "Response Documents" })).toBeInTheDocument();
    expect(screen.getByText(/Response documents are evidence and metadata only/i)).toBeInTheDocument();
    expect(screen.getByText(/No mailbox, Gmail, IMAP, or inbox integration is used/i)).toBeInTheDocument();
  });

  it("renders loading, empty, and error list states", () => {
    mocks.useResponseDocuments.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: mocks.refetchResponses,
    });
    const loadingRender = render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("Captured Responses")).toBeInTheDocument();
    loadingRender.unmount();

    mocks.useResponseDocuments.mockReturnValueOnce({
      data: { responses: [], total: 0 },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mocks.refetchResponses,
    });
    const emptyRender = render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("No response documents yet")).toBeInTheDocument();
    emptyRender.unmount();

    mocks.useResponseDocuments.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("Synthetic response list failure"),
      refetch: mocks.refetchResponses,
    });
    render(<AdminResponseDocumentsPage />);
    expect(screen.getByText("Unable to load response documents")).toBeInTheDocument();
    expect(screen.getByText("Synthetic response list failure")).toBeInTheDocument();
  });

  it("renders responses and sends supported filters to the response list hook", async () => {
    render(<AdminResponseDocumentsPage />);

    expect(screen.getByText("Response #901")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Response channel"), { target: { value: "email" } });
    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "bureau_email_response" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "linked_to_outcome" } });
    fireEvent.change(screen.getByLabelText("Packet ID"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Packet finding ID"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Finding outcome ID"), { target: { value: "23" } });
    fireEvent.change(screen.getByLabelText("Comparison run ID"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Offset"), { target: { value: "5" } });

    await waitFor(() => {
      expect(mocks.useResponseDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          responseChannel: "email",
          responseDocumentType: "bureau_email_response",
          responseStatus: "linked_to_outcome",
          packetId: 21,
          disputePacketFindingId: 22,
          findingOutcomeId: 23,
          comparisonRunId: 24,
          limit: 25,
          offset: 5,
        }),
      );
    });
  });

  it("loads detail, shows safe metadata, and states later report comparison remains required", async () => {
    render(<AdminResponseDocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    await waitFor(() => {
      expect(mocks.useResponseDocument).toHaveBeenCalledWith(901);
    });

    expect(screen.getAllByText("Response #901").length).toBeGreaterThan(0);
    expect(screen.getAllByText("email").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bureau email response").length).toBeGreaterThan(0);
    expect(screen.getAllByText("linked to outcome").length).toBeGreaterThan(0);
    expect(screen.getAllByText("21").length).toBeGreaterThan(0);
    expect(screen.getAllByText("22").length).toBeGreaterThan(0);
    expect(screen.getAllByText("23").length).toBeGreaterThan(0);
    expect(screen.getAllByText("24").length).toBeGreaterThan(0);
    expect(screen.getByText(/Response captured/i)).toBeInTheDocument();
    expect(screen.getByText(/Later credit-report comparison is required/i)).toBeInTheDocument();
  });

  it("redacts unsafe response metadata in the detail panel", async () => {
    mocks.detailResponse = unsafeDetailResponse;
    render(<AdminResponseDocumentsPage />);

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));
    await screen.findByText(/Response captured/i);

    expect(document.body).not.toHaveTextContent("SHOULD_NOT_RENDER_RAW_REPORT_TEXT");
    expect(document.body).not.toHaveTextContent("1234567890123456");
    expect(document.body).not.toHaveTextContent("raw report text");
    expect(document.body).not.toHaveTextContent("raw pdf text");
    expect(document.body).not.toHaveTextContent("full email body");
    expect(document.body).not.toHaveTextContent("packet body");
    expect(document.body).not.toHaveTextContent("s3://secret/path");
    expect(document.body).not.toHaveTextContent("x-goog-signature");
    expect(document.body).not.toHaveTextContent("database_url");
    expect(document.body).not.toHaveTextContent("The bureau violated the law");
    expect(document.body).not.toHaveTextContent("this proves correction");
  });

  it("is read-only and does not render unsupported response, legal, parser, or inbox controls", () => {
    render(<AdminResponseDocumentsPage />);

    expect(screen.queryByRole("button", { name: /capture response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review response/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark related/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark corrected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark removed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark unchanged/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prove correction/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /legal violation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^activate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enforce/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /demand/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /inbox sync/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect gmail/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /connect imap/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /parse response/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/you won/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/entitled to damages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/admitted fault/i)).not.toBeInTheDocument();
  });

  it("keeps source limited to response list/get endpoints and avoids forbidden runtime paths", () => {
    const source = [
      readFileSync(join(process.cwd(), "helpers/responseDocumentQueries.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "pages/admin-response-documents.tsx"), "utf8"),
      readFileSync(join(process.cwd(), "helpers/adminSidebarRoutes.ts"), "utf8"),
      readFileSync(join(process.cwd(), "components/AppLayout.tsx"), "utf8"),
    ].join("\n");

    expect(source).toContain("list_GET.schema");
    expect(source).toContain("get_GET.schema");
    expect(source).not.toContain("capture_POST.schema");
    expect(source).not.toContain("admin-review_POST.schema");
    expect(source).not.toMatch(/\/_api\/responses\/capture|\/_api\/responses\/admin-review/i);
    expect(source).not.toMatch(/useBureauCommunication|bureau-communication_POST|record-response_POST/i);
    expect(source).not.toMatch(/\/_api\/parser|\/_api\/ocr|\/_api\/ingest\/process/i);
    expect(source).not.toMatch(/\/_api\/packet\/(?:readiness|build|create|save|send|delivery|pdf)/i);
    expect(source).not.toMatch(/\/_api\/violations\/run|\/_api\/creditor-validation\/run/i);
    expect(source).not.toMatch(/\/_api\/regulation-registry\/runtime-bridge\/activate/i);
    expect(source).not.toMatch(/\/_api\/admin\/override|\/_api\/furnisher\/packet/i);
    expect(source).not.toMatch(/\/_api\/gmail|\/_api\/imap|\/_api\/mailbox|\/_api\/inbox/i);
    expect(source).not.toMatch(/\/_api\/report-artifact\/(?:create|update)|\/_api\/tradelines\/update|\/_api\/canonical/i);
  });
});
