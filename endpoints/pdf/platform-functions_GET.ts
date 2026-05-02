import { OutputType } from "./platform-functions_GET.schema";
import superjson from "superjson";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { generateServerPdf } from "../../helpers/pdfServerUtils";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

export async function handle(request: Request) {
  try {
    const sections = [
      {
        title: "1. Report Ingestion & Parsing",
        intro:
          "Comprehensive pipeline for ingesting, parsing, and extracting structured data from credit reports across various formats.",
        items: [
          "Upload credit reports (PDF or HTML)",
          "Anonymous upload preview (try-upload for prospects)",
          "DocStrange HTML extraction integration",
          "Bureau-specific parsing (TransUnion HTML, Equifax HTML, PDF text fallback)",
          "Auto bureau detection (weighted scoring)",
          "Dual-pass extraction (Pass A quick, Pass A Full comprehensive, Pass B gap-fill via Gemini)",
          "Consumer info extraction (name, address, DOB, phone, SIN, employment)",
          "Tradeline extraction with field-level confidence scoring",
          "Credit score extraction",
          "Inquiry extraction (hard/soft/promotional)",
          "Public record & bankruptcy extraction",
          "Consumer statement extraction",
          "Cross-bureau matching for duplicate tradeline detection",
          "Report artifact versioning and SHA-256 integrity hashing",
          "OCR extraction for scanned documents via Gemini",
        ],
      },
      {
        title: "2. Compliance Scanning & Violation Detection",
        intro:
          "Automated auditing engine that flags regulatory, logical, and formatting violations in credit reporting data.",
        items: [
          "45+ violation categories auto-scanned",
          "Bureau-specific compliance detectors (metro2, balance, status, temporal, date logic, etc.)",
          "Creditor/furnisher compliance detectors (reaging, phantom debt, rubber stamp, etc.)",
          "Collector-specific compliance detectors (license, fees, statute revival, duplicate reporting)",
          "Cross-entity discrepancy detection",
          "Dynamic scanning rules (AI-generated, admin-approved)",
          "Compliance configuration per violation category (enable/disable, confidence threshold)",
          "Regulation infraction scanner with statutory basis references",
          "Metro2 validation logging",
        ],
      },
      {
        title: "3. Dispute Letter (Packet) Generation & Delivery",
        intro:
          "End-to-end system for generating and delivering compliance-aligned dispute packages.",
        items: [
          "Auto-generated dispute packets per tradeline and violation",
          "Multi-template system (CRA, CPA, CPBPA, other bureau-specific templates)",
          "Smart challenge recommendation engine",
          "Packet compliance audit (regulatory alignment check)",
          "PDF packet generation with consumer certification & signature",
          "PostGrid registered mail delivery integration",
          "First-class mail delivery option",
          "Tracking number and delivery status monitoring",
          "Packet impact assessment (baseline vs follow-up snapshot comparison)",
          "Packet readiness validation before sending",
          "GCS cloud storage for generated PDFs",
          "Third-party recipient letter support",
        ],
      },
      {
        title: "4. Obligation Tracking & Escalation",
        intro:
          "Tracks statutory obligations and manages the procedural lifecycle of credit challenges.",
        items: [
          "80 statutory obligations tracked (Credit Bureau, Creditor, Bill Collector sections)",
          "Obligation instance lifecycle (Pending → Challenged → Response states → Procedurally Exhausted)",
          "4-phase terminal label progression system",
          "Response recording with audit fields (MOV, documentation, signatures, sender address)",
          "Response analysis pipeline",
          "Auto-escalation engine with configurable triggers",
          "Pressure score calculation per obligation instance",
          "Dispute vector tracking and rotation strategy",
          "Vector rotation analytics",
          "Success metrics tracking (outcomes, response times)",
          "Creditor obligation testing",
        ],
      },
      {
        title: "5. Evidence Chain Management",
        intro:
          "Secure, tamper-evident logging and storage of all evidence related to disputes and compliance.",
        items: [
          "Tamper-evident hash chain (SHA-256 linked evidence events)",
          "Evidence event logging per packet",
          "Evidence attachment upload (file storage)",
          "Evidence packaging for regulatory complaints",
          "Bureau communication evidence recording",
          "Challenge evidence panel",
          "Statute version linkage for regulatory context",
        ],
      },
      {
        title: "6. Bureau & Creditor Management",
        intro:
          "Centralized registries and verification tools for credit bureaus and furnisher entities.",
        items: [
          "Bureau registry (TransUnion, Equifax) with addresses",
          "Bureau dispute contact addresses",
          "Creditor entity registry with contact info",
          "Creditor name normalization (French-Canadian support)",
          "Creditor validation requirements tracking",
          "Collection agency license verification (Ontario open data integration)",
          "Licensed collection agency registry with AI verification",
          "Cross-bureau tradeline matching",
        ],
      },
      {
        title: "7. Tradeline Management",
        intro:
          "Detailed tracking, snapshotting, and monitoring of individual credit accounts over time.",
        items: [
          "Full tradeline detail view with all fields",
          "Tradeline snapshot versioning (point-in-time captures)",
          "Change detection between report uploads",
          "Drift monitoring and logging",
          "Compliance rescan on demand",
          "Tradeline search and filtering",
          "Backfill source text from original reports",
          "Gap-fill extraction for missing fields via AI",
          "Payment history tracking with delinquency analysis",
          "Related collection accounts linking",
        ],
      },
      {
        title: "8. Subscription & Billing",
        intro:
          "Flexible subscription plans and payment processing to support diverse user tiers.",
        items: [
          "7-day free trial for new registrations",
          "Monthly plan ($19.95 CAD) and Annual plan ($49.95 CAD)",
          "Stripe payment integration (PaymentElement checkout)",
          "Subscription status tracking (trialing, active, past_due, cancelled, expired)",
          "Plan upgrade/downgrade",
          "Subscription cancellation with reason tracking",
          "Trial countdown banner",
          "Account locking after trial expiry without subscription",
          "Renewal reminder emails via SendGrid",
          "PostGrid postal transaction billing with markup tracking",
        ],
      },
      {
        title: "9. User Management & Authentication",
        intro:
          "Secure access control, profile management, and session handling for all platform users.",
        items: [
          "Email/password registration and login",
          "OAuth login (Google via Floot OAuth)",
          "Email verification with token-based flow",
          "Password reset via email",
          "JWT session management with auto-cleanup",
          "Rate limiting on auth endpoints",
          "Login attempt tracking",
          "Profile management (name, address, province, DOB, phone)",
          "Profile completion checks",
          "Terms of service acceptance tracking with versioning",
          "Domain guard (enforce mode — restricts to published domains)",
        ],
      },
      {
        title: "10. Admin Dashboard & Tools",
        intro:
          "Internal tools for managing users, system configurations, testing parsers, and monitoring platform health.",
        items: [
          "User management (list, detail view, reset, delete)",
          "Compliance configuration management",
          "Feature flag management (6 flags, scoped global/admin/user)",
          "System settings management",
          "Knowledge base PDF generation (user-facing and admin versions)",
          "Parser testing suite (create, run, import/export test cases)",
          "Parser known entity management",
          "Version management (create, release, archive software versions)",
          "Release notes auto-generation",
          "Data retention automation with purge scheduling",
          "Semantic accuracy diagnostic",
          "Backfill compliance scans across all tradelines",
          "Seed data management (bureaus, statutes, obligations, creditor validations)",
          "Audit log viewer with entity-type filtering",
          "Support agent account creation",
          "Postal revenue tracking and reporting",
          "Stale auth cleanup",
        ],
      },
      {
        title: "11. Customer Support System",
        intro:
          "Integrated ticketing system to manage user inquiries, triage issues, and provide timely assistance.",
        items: [
          "User ticket submission (categorized: Account, Billing, Dispute Help, Technical, Other)",
          "Priority levels (Low, Medium, High, Urgent)",
          "Support agent ticket queue management",
          "Ticket assignment to agents",
          "Threaded replies with internal notes",
          "Status workflow (Open → In Progress → Waiting on User → Resolved → Closed)",
          "Email notifications on ticket events (SendGrid)",
          "Near-real-time polling (15s list, 10s detail)",
          "AI-powered support chat (L1/L2 triage)",
        ],
      },
      {
        title: "12. Identity Theft Protection",
        intro:
          "Tools for managing security freezes, fraud alerts, and identity theft documentation.",
        items: [
          "Security freeze management (create, monitor, cancel)",
          "Fraud alert filing",
          "Extended fraud alert support",
          "Thaw request processing",
          "Freeze timeline visualization",
          "Freeze protection statistics",
          "Consumer signature capture and verification",
          "Identity theft report upload and documentation",
        ],
      },
      {
        title: "13. Regulatory Intelligence",
        intro:
          "Continuous monitoring and reference library for statutes, regulatory changes, and industry standards.",
        items: [
          "Statute registry (18 statutes, 19 versions) with jurisdictional coverage",
          "Statute of limitations tracking with clock days",
          "Regulatory update monitoring (automated scan, manual entry)",
          "Regulatory update lifecycle (Detected → Under Review → Verified → Applied)",
          "Regulatory notification system with read/dismiss",
          "Auto-escalation of regulatory changes",
          "Regulatory rollback support",
          "Federal guidance reference library",
          "Industry standard reference (Metro2 format specs)",
          "Enforcement mechanism registry (complaint procedures, enforcing bodies, penalties)",
          "Discrimination claim tracking (Canadian Human Rights grounds)",
        ],
      },
      {
        title: "14. Calendar & Deadline Management",
        intro:
          "Comprehensive scheduling and deadline tracking for all compliance and dispute activities.",
        items: [
          "Response deadline tracking per obligation instance",
          "Compliance calendar view (monthly/weekly)",
          "Deadline creation, completion, and deletion",
          "Overdue deadline alerts",
          "Quick actions for upcoming deadlines",
          "Calendar event dialogs",
        ],
      },
      {
        title: "15. Analytics & Reporting",
        intro:
          "Dashboards and exportable reports providing insights into platform usage, success rates, and risks.",
        items: [
          "Dashboard statistics (tradeline counts, violation rates, packet status)",
          "Success analytics (outcomes by vector, bureau, creditor)",
          "Analytics report PDF generation",
          "Compliance audit documentation export",
          "CSV data export (tradelines, violations, obligations)",
          "Hidden risk register (consolidated risk view)",
          "Dispute journey tracker visualization",
          "Dispute rotation analytics",
        ],
      },
      {
        title: "16. Bankruptcy Management",
        intro:
          "Specialized tracking and lifecycle management for bankruptcy records and removal dates.",
        items: [
          "Bankruptcy record tracking (5 types: discharged, not discharged, consumer proposal, etc.)",
          "Provincial retention rules calculation",
          "Expected vs actual removal date tracking",
          "Bureau-specific reporting status (TransUnion/Equifax)",
          "Bankruptcy status lifecycle management",
        ],
      },
      {
        title: "17. Landing Page & Conversion",
        intro:
          "Public-facing pages optimized for prospect conversion and user onboarding.",
        items: [
          "Public landing page with hero, features, pricing, compliance, how-it-works sections",
          "Anonymous upload preview for prospect conversion",
          "Lead reminder capture",
          "Get Your Report guide",
          "Contact page",
          "Privacy policy and Terms of service pages",
          "User manual / knowledge base",
        ],
      },
    ];

    const content: any[] = [
      // Cover Page
      {
        text: "CREDIT REGULATOR PRO",
        style: "coverLogo",
        margin: [0, 150, 0, 20],
      },
      {
        text: "Platform Functions Reference",
        style: "coverTitle",
        margin: [0, 0, 0, 10],
      },
      {
        text: "Canada's Credit Bureau Compliance Audit Engine",
        style: "coverTagline",
        margin: [0, 0, 0, 40],
      },
      {
        text: `Version Date: ${new Intl.DateTimeFormat("en-CA").format(new Date())}`,
        style: "coverDate",
        pageBreak: "after",
      },

      // Table of Contents
      {
        toc: {
          title: { text: "Table of Contents", style: "tocTitle" },
        },
      },
    ];

    sections.forEach((sec, index) => {
      content.push({
        text: sec.title,
        style: "sectionTitle",
        tocItem: true,
        pageBreak: index === 0 ? "before" : undefined,
        margin: [0, index === 0 ? 0 : 20, 0, 10],
      });
      content.push({
        text: sec.intro,
        style: "sectionIntro",
        margin: [0, 0, 0, 10],
      });
      content.push({
        ul: sec.items,
        style: "listItems",
        margin: [10, 0, 0, 20],
      });
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: "LETTER",
      pageMargins: [40, 60, 40, 60],
      header: function (currentPage: number) {
        if (currentPage > 1) {
          return {
            text: "Credit Regulator Pro — Platform Functions Reference",
            margin: [40, 20, 40, 0],
            fontSize: 9,
            color: "#888888",
            alignment: "right",
          };
        }
        return null;
      },
      footer: function (currentPage: number, pageCount: number) {
        return {
          columns: [
            {
              text: `Generated on ${new Intl.DateTimeFormat("en-CA").format(new Date())}`,
              alignment: "left",
              fontSize: 9,
              color: "#888888",
            },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              alignment: "right",
              fontSize: 9,
              color: "#888888",
            },
          ],
          margin: [40, 20, 40, 0],
        };
      },
      content: content as any,
      styles: {
        coverLogo: {
          fontSize: 24,
          bold: true,
          color: "#1e3a5f",
          alignment: "center",
          characterSpacing: 2,
        },
        coverTitle: {
          fontSize: 32,
          bold: true,
          color: "#111111",
          alignment: "center",
        },
        coverTagline: {
          fontSize: 16,
          color: "#2563eb",
          alignment: "center",
          italics: true,
        },
        coverDate: {
          fontSize: 12,
          color: "#666666",
          alignment: "center",
        },
        tocTitle: {
          fontSize: 22,
          bold: true,
          color: "#1e3a5f",
          margin: [0, 0, 0, 15],
        },
        sectionTitle: { fontSize: 18, bold: true, color: "#1e3a5f" },
        sectionIntro: { fontSize: 11, color: "#444444", lineHeight: 1.4 },
        listItems: {
          fontSize: 11,
          color: "#222222",
          lineHeight: 1.4,
          markerColor: "#2563eb",
        },
      } as any,
      defaultStyle: {
        font: "Roboto",
      },
    };

    const pdfBase64 = await generateServerPdf(docDefinition);

    return new Response(
      superjson.stringify({ pdf: pdfBase64 } satisfies OutputType),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
