import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PacketDetail } from "../../endpoints/packet/get_GET.schema";

const mocks = vi.hoisted(() => ({
  packet: null as PacketDetail | null,
  isLoading: false,
  error: null as unknown,
  deletePacket: vi.fn(),
  updatePacketStatus: vi.fn(),
}));

vi.mock("../../helpers/usePacketViewer", () => ({
  usePacketViewer: () => ({
    packet: mocks.packet,
    isLoading: mocks.isLoading,
    error: mocks.error,
  }),
}));

vi.mock("../../helpers/packetQueries", () => ({
  useDeletePacket: () => ({
    mutateAsync: mocks.deletePacket,
    isPending: false,
  }),
}));

vi.mock("../../helpers/useUpdatePacketStatus", () => ({
  useUpdatePacketStatus: () => ({
    mutate: mocks.updatePacketStatus,
    isPending: false,
  }),
}));

vi.mock("@react-pdf-viewer/core", () => ({
  Worker: ({ children }: { children?: ReactNode }) => children ?? null,
  Viewer: ({ fileUrl }: { fileUrl: string }) => <div data-testid="pdf-viewer">{fileUrl}</div>,
}));

vi.mock("@react-pdf-viewer/default-layout", () => ({
  defaultLayoutPlugin: () => ({}),
}));

vi.mock("../../components/DeliveryWizard", () => ({
  DeliveryWizard: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { PacketViewer } from "../../components/PacketViewer";

const readyMessage =
  "Your letter is ready to review. You can download, print, or send it when you are satisfied with the contents.";
const plainErrorMessage =
  "Could not load this letter. Please try again, or contact support if the problem continues.";
const internalPdfTerms =
  /PDF rendering is content-based|rendering is content-based|render\/cache|render and cache|cache retrieval|cache-miss|\bcache\b|internal render|system diagnostic/i;

function packet(overrides: Partial<PacketDetail> = {}): PacketDetail {
  return {
    id: 601,
    status: "generated",
    terminalLabel: null,
    createdAt: "2026-05-21T12:00:00.000Z" as unknown as Date,
    pdfStorageUrl: null,
    sentDate: null,
    deliveryMethod: null,
    trackingNumber: null,
    letterDate: "2026-05-21T00:00:00.000Z" as unknown as Date,
    consumerCertification: null,
    recipientName: "TransUnion Canada",
    tradelineAccountNumber: "Account ending 1234",
    bureauName: "TransUnion Canada",
    lifecycle: {
      deterministic: true,
      ruleId: "packet-lifecycle-v1",
      stage: "READY_TO_SEND",
      nextAction: "RECORD_MAILING",
      label: "Ready to mail",
      detail: "Record mailing when the letter is sent.",
      responseDueDate: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.packet = packet();
  mocks.isLoading = false;
  mocks.error = null;
});

describe("PacketViewer PDF status wording", () => {
  it("shows the plain ready message and hides render/cache internals", () => {
    render(<PacketViewer packetId={601} open onOpenChange={vi.fn()} />);

    const visibleText = document.body.textContent ?? "";
    expect(screen.getByText(readyMessage)).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer")).toHaveTextContent("/_api/packet/pdf?packetId=601");
    expect(visibleText).not.toMatch(internalPdfTerms);
  });

  it("shows a plain-language error without leaking render/cache diagnostics", () => {
    mocks.packet = null;
    mocks.error = new Error("Packet PDF cache-miss render exceeded 100ms.");

    render(<PacketViewer packetId={601} open onOpenChange={vi.fn()} />);

    const visibleText = document.body.textContent ?? "";
    expect(screen.getByText(plainErrorMessage)).toBeInTheDocument();
    expect(visibleText).not.toMatch(internalPdfTerms);
    expect(visibleText).not.toMatch(/packet readiness was not changed/i);
  });
});
