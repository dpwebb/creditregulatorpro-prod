import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
  AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
  BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
  EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
  formatUploadLimit,
} from "../../helpers/uploadPayloadValidation";
import {
  FRONTEND_LIMITED_BETA_READINESS,
  FRONTEND_UPLOAD_LIMITS,
} from "../../helpers/frontendProductionReadinessUx";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("frontend production-readiness UX constraints", () => {
  it("uses server upload constants for visible report and evidence limits", () => {
    expect(FRONTEND_UPLOAD_LIMITS.authenticatedReport).toEqual({
      maxBytes: AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES,
      label: formatUploadLimit(AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES),
    });
    expect(FRONTEND_UPLOAD_LIMITS.anonymousReport).toEqual({
      maxBytes: ANONYMOUS_REPORT_UPLOAD_MAX_BYTES,
      label: formatUploadLimit(ANONYMOUS_REPORT_UPLOAD_MAX_BYTES),
    });
    expect(FRONTEND_UPLOAD_LIMITS.evidenceAttachment).toEqual({
      maxBytes: EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES,
      label: formatUploadLimit(EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES),
    });
    expect(FRONTEND_UPLOAD_LIMITS.bureauCommunication).toEqual({
      maxBytes: BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES,
      label: formatUploadLimit(BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES),
    });

    expect(source("pages/upload.tsx")).toContain("AUTHENTICATED_UPLOAD_LIMIT.maxBytes");
    expect(source("pages/try-upload.tsx")).toContain("ANONYMOUS_UPLOAD_LIMIT.maxBytes");
    expect(source("components/EvidenceUploadDialog.tsx")).toContain("EVIDENCE_UPLOAD_LIMIT.maxBytes");
    expect(source("components/BureauCommunicationDialog.tsx")).toContain("BUREAU_COMMUNICATION_UPLOAD_LIMIT.maxBytes");
  });

  it("keeps queued ingest, failure, and operator-review states visible without runtime throttle claims", () => {
    const uploadSource = source("pages/upload.tsx");
    const adminSource = source("pages/admin-response-documents.tsx");
    const readinessSource = source("helpers/frontendProductionReadinessUx.ts");

    expect(uploadSource).toContain('case "queued"');
    expect(uploadSource).toContain('case "running"');
    expect(uploadSource).toContain('case "retry_scheduled"');
    expect(uploadSource).toContain('case "dead_lettered"');
    expect(uploadSource).toContain('case "failed"');
    expect(adminSource).toContain("Ingest Queue Visibility");
    expect(adminSource).toContain("Raw bytes stored");
    expect(adminSource).toContain("Extracted text stored");
    expect(readinessSource).toContain("policy gate, not a runtime throttle");
  });

  it("keeps packet readiness review language visible while keeping render/cache diagnostics admin-only", () => {
    const packetsSource = source("pages/packets.tsx");
    const packetViewerSource = source("components/PacketViewer.tsx");
    const packetPdfCacheSource = source("helpers/packetPdfCache.ts");

    expect(packetsSource).toContain("needs review before a letter can be created");
    expect(packetsSource).toContain("Replies from bureaus, creditors, or collectors appear here after they are captured.");
    expect(packetsSource).not.toContain("readiness blockers");
    expect(packetsSource).not.toContain("Intake classification only");
    expect(packetsSource).not.toContain("safe comparison");
    expect(packetsSource).toContain("{isAdmin ? (");
    expect(packetsSource).toContain("Packet PDFs may render on first open/download");
    expect(packetsSource).toContain(
      "Open a letter to review it, then download, print, or send it when you are satisfied with the contents.",
    );
    expect(packetViewerSource).toContain(
      "Your letter is ready to review. You can download, print, or send it when you are satisfied with the contents.",
    );
    expect(packetViewerSource).toContain(
      "Could not load this letter. Please try again, or contact support if the problem continues.",
    );
    expect(packetViewerSource).not.toContain("first open/download may render and cache the packet");
    expect(packetViewerSource).not.toContain("Rendering or cache retrieval may have failed");
    expect(packetPdfCacheSource).toContain("Packet PDF render attempted");
    expect(packetPdfCacheSource).toContain("Packet PDF cache hit");
  });

  it("does not claim broad production or production-at-scale readiness", () => {
    const uiSource = [
      source("helpers/frontendProductionReadinessUx.ts"),
      source("pages/upload.tsx"),
      source("pages/try-upload.tsx"),
      source("pages/packets.tsx"),
      source("pages/admin-response-documents.tsx"),
      source("pages/admin-compliance-config.tsx"),
      source("components/PacketViewer.tsx"),
    ].join("\n");

    expect(FRONTEND_LIMITED_BETA_READINESS.classification).toBe("Limited beta only under strict constraints");
    expect(uiSource).toContain("Not broad-production ready. Not production-at-scale ready.");
    expect(uiSource).not.toMatch(/\b(?:is|are)\s+(?:now\s+)?production-at-scale ready\b/i);
    expect(uiSource).not.toMatch(/\b(?:is|are)\s+(?:now\s+)?broad-production ready\b/i);
  });
});
