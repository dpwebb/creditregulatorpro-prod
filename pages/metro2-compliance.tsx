import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Filter,
  History,
  Info,
  ListChecks,
  RefreshCcw,
  Scale,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { Metro2VersionInfo } from "../components/Metro2VersionInfo";
import {
  Metro2Rules2025,
  Metro2ValidationRule,
} from "../helpers/metro2ValidationRules";
import {
  CraObligationType,
  CraObligationTypeArrayValues,
  ValidationSeverity,
} from "../helpers/schema";
import { format } from "../helpers/dateUtils";
import { useAuth } from "../helpers/useAuth";
import { useToast } from "../helpers/useToast";
import styles from "./metro2-compliance.module.css";

type Metro2Field = {
  id: string;
  name: string;
  segment: "Base" | "J1" | "J2" | "K1" | "K2" | "K3" | "K4" | "L1" | "N1";
  type: "Alphanumeric" | "Numeric" | "Date" | "Monetary";
  length: number;
  required: boolean;
  description: string;
};

const METRO2_FIELDS: Metro2Field[] = [
  {
    id: "Base-1",
    name: "Block Descriptor",
    segment: "Base",
    type: "Numeric",
    length: 4,
    required: true,
    description: "Always 0426 for Base Segment.",
  },
  {
    id: "Base-5",
    name: "Consumer Account Number",
    segment: "Base",
    type: "Alphanumeric",
    length: 30,
    required: true,
    description: "The unique account number assigned by the creditor.",
  },
  {
    id: "Base-6",
    name: "Portfolio Type",
    segment: "Base",
    type: "Alphanumeric",
    length: 1,
    required: true,
    description:
      "C (Line of Credit), I (Installment), M (Mortgage), O (Open), R (Revolving).",
  },
  {
    id: "Base-7",
    name: "Account Type",
    segment: "Base",
    type: "Alphanumeric",
    length: 2,
    required: true,
    description:
      "Code indicating the specific type of account (e.g., 01 for Auto, 18 for Credit Card).",
  },
  {
    id: "Base-8",
    name: "Date Opened",
    segment: "Base",
    type: "Date",
    length: 8,
    required: true,
    description: "MMDDYYYY format. The date the account was originally opened.",
  },
  {
    id: "Base-9",
    name: "Credit Limit",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: false,
    description: "Assigned credit limit for revolving accounts.",
  },
  {
    id: "Base-10",
    name: "Highest Credit/Original Loan Amount",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: true,
    description: "Highest amount ever owed or original loan amount.",
  },
  {
    id: "Base-12",
    name: "Scheduled Monthly Payment Amount",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: false,
    description: "The amount due each month.",
  },
  {
    id: "Base-13",
    name: "Actual Payment Amount",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: false,
    description: "The amount actually paid by the consumer.",
  },
  {
    id: "Base-14",
    name: "Account Status",
    segment: "Base",
    type: "Alphanumeric",
    length: 2,
    required: true,
    description:
      "Current status of the account (e.g., 11 for Current, 13 for Paid).",
  },
  {
    id: "Base-15",
    name: "Payment Rating",
    segment: "Base",
    type: "Alphanumeric",
    length: 1,
    required: false,
    description:
      "Rating of the payment history (e.g., 0 for Current, 1 for 30 days late).",
  },
  {
    id: "Base-16",
    name: "Payment History Profile",
    segment: "Base",
    type: "Alphanumeric",
    length: 24,
    required: true,
    description: "24-month history of payment ratings.",
  },
  {
    id: "Base-19",
    name: "Current Balance",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: true,
    description: "The outstanding balance as of the Date of Account Information.",
  },
  {
    id: "Base-20",
    name: "Amount Past Due",
    segment: "Base",
    type: "Monetary",
    length: 9,
    required: false,
    description: "Total amount past due.",
  },
  {
    id: "Base-23",
    name: "Date Closed",
    segment: "Base",
    type: "Date",
    length: 8,
    required: false,
    description:
      "MMDDYYYY format. Required when an account is reported as closed or paid.",
  },
  {
    id: "Base-24",
    name: "Date of Account Information",
    segment: "Base",
    type: "Date",
    length: 8,
    required: true,
    description: "The date the data was extracted (Report Date).",
  },
  {
    id: "Base-25",
    name: "Date of First Delinquency",
    segment: "Base",
    type: "Date",
    length: 8,
    required: false,
    description:
      "The date the first delinquency occurred that led to the current status.",
  },
  {
    id: "J1-1",
    name: "Associated Consumer Name",
    segment: "J1",
    type: "Alphanumeric",
    length: 60,
    required: true,
    description: "Name of the associated consumer (Joint, User, etc.).",
  },
  {
    id: "J2-1",
    name: "Associated Consumer Name",
    segment: "J2",
    type: "Alphanumeric",
    length: 60,
    required: true,
    description: "Name of the second associated consumer.",
  },
  {
    id: "K1-1",
    name: "Original Creditor Name",
    segment: "K1",
    type: "Alphanumeric",
    length: 32,
    required: true,
    description: "Name of the company that originally opened the account.",
  },
];

const CRA_DESCRIPTIONS: Record<CraObligationType, string> = {
  ACCURACY_INTEGRITY:
    "Under provincial Consumer Reporting Acts, data providers must maintain written policies and controls that support complete and accurate reporting to consumer reporting agencies.",
  CORRECTION_DUTY:
    "If a furnisher determines that reported information is not complete or accurate, it must promptly provide corrected data to the consumer reporting agency.",
  DATA_VALIDATION:
    "Furnishers must validate reported data so it conforms to Metro 2 formatting and accurately reflects account status and history.",
  DISPUTE_INVESTIGATION:
    "Upon receiving a dispute notice, furnishers must investigate, review relevant information, and report results back to the agency.",
  DOFD_REPORTING:
    "Furnishers must report Date of First Delinquency for delinquent, charged-off, or collection accounts where required by bureau guidance.",
  MONTHLY_REPORTING:
    "While provincial law may not mandate every monthly cycle, industry standards require each furnished cycle to be complete and accurate.",
};

type RuleImpact = "Likely Violation" | "Informational";
type RuleConfidence = "HIGH" | "MEDIUM" | "LOW";

type RuleSource = {
  label: string;
  url?: string;
};

type RuleGuidance = {
  whyMatters: string;
  whatToCheck: string[];
  fieldRefs: string[];
  sources: RuleSource[];
  lastReviewed: string;
  confidence: RuleConfidence;
};

type QuickChecklistItem = {
  id: string;
  title: string;
  check: string;
};

type GuideChangeLogEntry = {
  date: string;
  summary: string;
  details: string;
};

const GUIDE_LAST_REVIEWED = "2026-05-03";

const DEFAULT_RULE_SOURCES: RuleSource[] = [
  {
    label: "CDIA Metro 2 Resource Hub",
    url: "https://www.cdiaonline.org/resources/metro2/",
  },
  {
    label: "Internal Rule Set: helpers/metro2ValidationRules.tsx",
  },
];

const RULE_GUIDANCE: Record<string, RuleGuidance> = {
  BASE_SEGMENT_REQUIRED: {
    whyMatters:
      "Missing base segment identifiers can prevent reliable account matching and can invalidate downstream compliance checks.",
    whatToCheck: [
      "Account number is present and not 'Unknown'.",
      "Account status is present unless collection-specific exception applies.",
      "Date opened and current balance are populated.",
    ],
    fieldRefs: ["Base-5", "Base-14", "Base-8", "Base-19"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "HIGH",
  },
  DATE_OPENED_VS_REPORTED: {
    whyMatters:
      "If an account appears to be opened after it was reported, chronology is inconsistent and indicates likely reporting quality issues.",
    whatToCheck: [
      "Date Opened (Base-8) is on or before Date of Account Information (Base-24).",
      "Date formats are valid and parsed consistently.",
      "No future-dated values relative to report extraction date.",
    ],
    fieldRefs: ["Base-8", "Base-24"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "HIGH",
  },
  DATE_DOFD_LOGIC: {
    whyMatters:
      "Delinquency timelines affect retention windows and dispute decisions; inconsistent DOFD signals can materially change outcomes.",
    whatToCheck: [
      "Date of First Delinquency exists when past due amount is greater than zero.",
      "DOFD is not earlier than Date Opened for non-collection accounts.",
      "Past due amount and DOFD logic stay aligned.",
    ],
    fieldRefs: ["Base-25", "Base-20", "Base-8"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "MEDIUM",
  },
  BALANCE_PAST_DUE_CONSISTENCY: {
    whyMatters:
      "An overdue amount that exceeds the account balance usually indicates data inconsistency, except for defined edge statuses.",
    whatToCheck: [
      "Amount Past Due (Base-20) is less than or equal to Current Balance (Base-19).",
      "Status/collection exceptions are applied before flagging.",
      "Numeric values are normalized before comparison.",
    ],
    fieldRefs: ["Base-20", "Base-19", "Base-14"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "HIGH",
  },
  BALANCE_PAID_ZERO: {
    whyMatters:
      "Accounts marked paid with non-zero balances can misstate consumer liability and trigger incorrect compliance findings.",
    whatToCheck: [
      "Paid/closed status codes map correctly.",
      "Current Balance (Base-19) equals zero for paid statuses.",
      "Amount Past Due (Base-20) equals zero for paid statuses.",
    ],
    fieldRefs: ["Base-14", "Base-19", "Base-20"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "HIGH",
  },
  CREDITOR_NAME_REQUIRED: {
    whyMatters:
      "Without a reliable reporting entity, traceability and dispute routing are weakened.",
    whatToCheck: [
      "Original Creditor Name (K1-1) is present and not default placeholder text.",
      "Creditor identity matches report context.",
      "Unknown creditor values are remediated before filing output.",
    ],
    fieldRefs: ["K1-1"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "HIGH",
  },
  DATE_CLOSED_REQUIRED: {
    whyMatters:
      "Closed-account timelines require a close date for accurate lifecycle interpretation and retention analysis.",
    whatToCheck: [
      "Date Closed (Base-23) exists when status indicates closed/paid.",
      "Open-account exclusions are respected.",
      "Date Closed is valid and not earlier than Date Opened.",
    ],
    fieldRefs: ["Base-23", "Base-14", "Base-8"],
    sources: DEFAULT_RULE_SOURCES,
    lastReviewed: GUIDE_LAST_REVIEWED,
    confidence: "MEDIUM",
  },
};

const QUICK_CHECK_ITEMS: QuickChecklistItem[] = [
  {
    id: "required-fields",
    title: "Required Base Fields",
    check:
      "Confirm account number, status, opened date, and current balance are present.",
  },
  {
    id: "date-order",
    title: "Date Ordering",
    check: "Confirm Date Opened is not after Date of Account Information.",
  },
  {
    id: "dofd",
    title: "Delinquency Timeline",
    check:
      "If past due > 0, confirm Date of First Delinquency is populated and logically ordered.",
  },
  {
    id: "balance-consistency",
    title: "Balance Consistency",
    check:
      "Confirm Amount Past Due does not exceed Current Balance for non-exempt statuses.",
  },
  {
    id: "paid-status",
    title: "Paid Status Hygiene",
    check:
      "For paid/closed statuses, confirm Current Balance and Amount Past Due are both zero.",
  },
  {
    id: "creditor-name",
    title: "Reporter Traceability",
    check:
      "Confirm Original Creditor Name is present and not a placeholder value.",
  },
];

const GUIDE_CHANGE_LOG: GuideChangeLogEntry[] = [
  {
    date: "2026-05-03",
    summary: "Structured guidance format added",
    details:
      "Each rule now includes Rule, Why it matters, and What to check sections.",
  },
  {
    date: "2026-05-03",
    summary: "Rule filtering and quick-check workflow added",
    details:
      "Added search/category/severity/impact filters plus a 2-minute checklist tab.",
  },
  {
    date: "2026-05-03",
    summary: "Source traceability and field linkage added",
    details:
      "Added citations, last-reviewed metadata, and direct links from rules to applicable field references.",
  },
];

function getImpactLabel(severity: ValidationSeverity): RuleImpact {
  return severity === "INFO" ? "Informational" : "Likely Violation";
}

function getConfidenceLabel(severity: ValidationSeverity): RuleConfidence {
  if (severity === "ERROR") return "HIGH";
  if (severity === "WARNING") return "MEDIUM";
  return "LOW";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type EnrichedRule = Metro2ValidationRule & {
  guidance: RuleGuidance;
  impact: RuleImpact;
  confidence: RuleConfidence;
};

function getSeverityBadgeVariant(
  severity: ValidationSeverity,
): "error" | "warning" | "info" {
  if (severity === "ERROR") return "error";
  if (severity === "WARNING") return "warning";
  return "info";
}

function getImpactBadgeVariant(impact: RuleImpact): "error" | "info" {
  return impact === "Likely Violation" ? "error" : "info";
}

function getConfidenceBadgeVariant(
  confidence: RuleConfidence,
): "success" | "warning" | "default" {
  if (confidence === "HIGH") return "success";
  if (confidence === "MEDIUM") return "warning";
  return "default";
}

export default function Metro2CompliancePage() {
  const { showSuccess, showError, showInfo } = useToast();
  const [activeTab, setActiveTab] = useState("validation-rules");
  const [ruleSearch, setRuleSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedSeverity, setSelectedSeverity] = useState<
    ValidationSeverity | "All"
  >("All");
  const [selectedImpact, setSelectedImpact] = useState<RuleImpact | "All">(
    "All",
  );
  const [selectedConfidence, setSelectedConfidence] = useState<
    RuleConfidence | "All"
  >("All");
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<string>("All");
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(
    null,
  );
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>(
    {},
  );

  const navigate = useNavigate();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState.type === "unauthenticated") {
      navigate("/login");
    } else if (
      authState.type === "authenticated" &&
      authState.user.role !== "admin"
    ) {
      navigate("/");
    }
  }, [authState, navigate]);

  useEffect(() => {
    if (!highlightedFieldId) return;
    const timer = window.setTimeout(() => setHighlightedFieldId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightedFieldId]);

  const rulesWithGuidance = useMemo<EnrichedRule[]>(() => {
    return Metro2Rules2025.rules.map((rule) => {
      const impact = getImpactLabel(rule.severity);
      const defaultConfidence = getConfidenceLabel(rule.severity);
      const guidance = RULE_GUIDANCE[rule.ruleName] ?? {
        whyMatters:
          "No additional narrative guidance is published for this rule yet.",
        whatToCheck: [rule.description],
        fieldRefs: [],
        sources: DEFAULT_RULE_SOURCES,
        lastReviewed: GUIDE_LAST_REVIEWED,
        confidence: defaultConfidence,
      };

      return {
        ...rule,
        impact,
        confidence: guidance.confidence ?? defaultConfidence,
        guidance,
      };
    });
  }, []);

  const ruleCategories = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(rulesWithGuidance.map((rule) => rule.category))),
    ];
  }, [rulesWithGuidance]);

  const filteredRules = useMemo(() => {
    const normalizedSearch = ruleSearch.trim().toLowerCase();
    return rulesWithGuidance.filter((rule) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        rule.ruleName.toLowerCase().includes(normalizedSearch) ||
        rule.description.toLowerCase().includes(normalizedSearch) ||
        rule.category.toLowerCase().includes(normalizedSearch) ||
        rule.guidance.whyMatters.toLowerCase().includes(normalizedSearch);
      const matchesCategory =
        selectedCategory === "All" || rule.category === selectedCategory;
      const matchesSeverity =
        selectedSeverity === "All" || rule.severity === selectedSeverity;
      const matchesImpact =
        selectedImpact === "All" || rule.impact === selectedImpact;
      const matchesConfidence =
        selectedConfidence === "All" || rule.confidence === selectedConfidence;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSeverity &&
        matchesImpact &&
        matchesConfidence
      );
    });
  }, [
    ruleSearch,
    rulesWithGuidance,
    selectedCategory,
    selectedSeverity,
    selectedImpact,
    selectedConfidence,
  ]);

  const groupedFilteredRules = useMemo(() => {
    const groups: Record<string, EnrichedRule[]> = {};
    filteredRules.forEach((rule) => {
      if (!groups[rule.category]) {
        groups[rule.category] = [];
      }
      groups[rule.category].push(rule);
    });
    return groups;
  }, [filteredRules]);

  const availableSegments = useMemo(() => {
    return [
      "All",
      ...Array.from(new Set(METRO2_FIELDS.map((field) => field.segment))),
    ];
  }, []);

  const filteredFields = useMemo(() => {
    return METRO2_FIELDS.filter((field) => {
      const matchesSearch =
        field.name.toLowerCase().includes(fieldSearch.toLowerCase()) ||
        field.description.toLowerCase().includes(fieldSearch.toLowerCase()) ||
        field.id.toLowerCase().includes(fieldSearch.toLowerCase());
      const matchesSegment =
        selectedSegment === "All" || field.segment === selectedSegment;
      return matchesSearch && matchesSegment;
    });
  }, [fieldSearch, selectedSegment]);

  const checklistCompletedCount = useMemo(() => {
    return QUICK_CHECK_ITEMS.filter((item) => checklistState[item.id]).length;
  }, [checklistState]);

  const checklistProgressPercent = useMemo(() => {
    if (QUICK_CHECK_ITEMS.length === 0) return 0;
    return Math.round(
      (checklistCompletedCount / QUICK_CHECK_ITEMS.length) * 100,
    );
  }, [checklistCompletedCount]);

  const resetRuleFilters = () => {
    setRuleSearch("");
    setSelectedCategory("All");
    setSelectedSeverity("All");
    setSelectedImpact("All");
    setSelectedConfidence("All");
  };

  const handleFieldJump = (fieldId: string) => {
    setActiveTab("field-reference");
    setSelectedSegment("All");
    setFieldSearch(fieldId);
    setHighlightedFieldId(fieldId);
    showInfo(`Showing field ${fieldId} in Field Reference.`);
  };

  const toggleChecklistItem = (id: string) => {
    setChecklistState((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const resetChecklist = () => {
    setChecklistState({});
    showInfo("Checklist reset.");
  };

  const exportRulesCsv = () => {
    const csvEscape = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const header = [
      "Rule Name",
      "Category",
      "Severity",
      "Impact",
      "Confidence",
      "Description",
      "Why It Matters",
      "What To Check",
      "Field References",
      "Last Reviewed",
      "Sources",
    ];

    const rows = filteredRules.map((rule) => {
      const sourceLabel = rule.guidance.sources
        .map((source) =>
          source.url ? `${source.label} (${source.url})` : source.label,
        )
        .join(" | ");

      return [
        csvEscape(rule.ruleName),
        csvEscape(rule.category),
        csvEscape(rule.severity),
        csvEscape(rule.impact),
        csvEscape(rule.confidence),
        csvEscape(rule.description),
        csvEscape(rule.guidance.whyMatters),
        csvEscape(rule.guidance.whatToCheck.join(" | ")),
        csvEscape(rule.guidance.fieldRefs.join(" | ")),
        csvEscape(rule.guidance.lastReviewed),
        csvEscape(sourceLabel),
      ].join(",");
    });

    const csvContent = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `metro2-compliance-rules-${format(new Date(), "yyyyMMdd")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showSuccess("Rule export generated.");
  };

  const openPdfPreview = () => {
    const generatedAt = format(new Date(), "yyyy-MM-dd HH:mm");
    const ruleSections = filteredRules
      .map((rule) => {
        const checks = rule.guidance.whatToCheck
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("");
        const refs = rule.guidance.fieldRefs.length
          ? `<p><strong>Field References:</strong> ${escapeHtml(rule.guidance.fieldRefs.join(", "))}</p>`
          : "";
        const sources = rule.guidance.sources
          .map((source) => {
            if (!source.url) return `<li>${escapeHtml(source.label)}</li>`;
            return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a></li>`;
          })
          .join("");

        return `
          <section style="margin-bottom:20px;padding:14px;border:1px solid #d0d7de;border-radius:8px;">
            <h3 style="margin:0 0 8px 0;font-family:Arial,sans-serif;">${escapeHtml(rule.ruleName)}</h3>
            <p style="margin:0 0 8px 0;"><strong>Category:</strong> ${escapeHtml(rule.category)} | <strong>Severity:</strong> ${escapeHtml(rule.severity)} | <strong>Impact:</strong> ${escapeHtml(rule.impact)} | <strong>Confidence:</strong> ${escapeHtml(rule.confidence)}</p>
            <p style="margin:0 0 8px 0;">${escapeHtml(rule.description)}</p>
            <p style="margin:0 0 8px 0;"><strong>Why It Matters:</strong> ${escapeHtml(rule.guidance.whyMatters)}</p>
            <p style="margin:0 0 6px 0;"><strong>What To Check:</strong></p>
            <ul style="margin:0 0 8px 20px;">${checks}</ul>
            ${refs}
            <p style="margin:0 0 6px 0;"><strong>Sources:</strong></p>
            <ul style="margin:0 0 0 20px;">${sources}</ul>
            <p style="margin:10px 0 0 0;color:#57606a;"><strong>Last Reviewed:</strong> ${escapeHtml(rule.guidance.lastReviewed)}</p>
          </section>
        `;
      })
      .join("");

    const preview = window.open(
      "",
      "_blank",
      "noopener,noreferrer,width=1200,height=900",
    );
    if (!preview) {
      showError("Unable to open PDF preview window. Allow pop-ups and retry.");
      return;
    }

    preview.document.open();
    preview.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Metro 2 Compliance Guide Export</title>
        </head>
        <body style="font-family:Arial,sans-serif;margin:20px;color:#0f172a;">
          <h1 style="margin:0 0 8px 0;">Metro 2 Compliance Guide Snapshot</h1>
          <p style="margin:0 0 16px 0;color:#475569;">Generated: ${escapeHtml(generatedAt)} | Filtered Rules: ${filteredRules.length}</p>
          ${ruleSections || "<p>No rules matched current filters.</p>"}
          <script>window.focus();</script>
        </body>
      </html>
    `);
    preview.document.close();
    showInfo("Preview opened. Use your browser print dialog to save as PDF.");
  };

  if (authState.type === "loading") {
    return (
      <div className={styles.pageContainer}>
        <div style={{ padding: "var(--spacing-6)" }}>
          <Skeleton style={{ height: "150px", marginBottom: "2rem" }} />
          <Skeleton style={{ height: "400px" }} />
        </div>
      </div>
    );
  }

  if (authState.type !== "authenticated" || authState.user.role !== "admin") {
    return null;
  }

  return (
    <div className={styles.pageContainer}>
      <Helmet>
        <title>Metro 2 Compliance | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Metro 2 Compliance Guide"
        subtitle="Operational rulebook for validation checks, source traceability, and compliance actions."
        role={authState.user.role}
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        defaultValue="validation-rules"
        className={styles.tabs}
      >
        <TabsList className={styles.tabsList}>
          <TabsTrigger value="version-history">
            <History size={16} className={styles.tabIcon} />
            Version History
          </TabsTrigger>
          <TabsTrigger value="validation-rules">
            <ShieldCheck size={16} className={styles.tabIcon} />
            Validation Rules
          </TabsTrigger>
          <TabsTrigger value="field-reference">
            <BookOpen size={16} className={styles.tabIcon} />
            Field Reference
          </TabsTrigger>
          <TabsTrigger value="quick-check">
            <ListChecks size={16} className={styles.tabIcon} />
            Quick Check
          </TabsTrigger>
          <TabsTrigger value="cra-obligations">
            <Scale size={16} className={styles.tabIcon} />
            CRA Obligations
          </TabsTrigger>
          <TabsTrigger value="guide-changelog">
            <Info size={16} className={styles.tabIcon} />
            Guide Changelog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="version-history" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>Metro 2 Format Evolution</h2>
            <p className={styles.sectionText}>
              Metro 2 is the common reporting format used by major consumer
              reporting agencies. Use this section for version background; use
              Validation Rules for day-to-day compliance checks.
            </p>
          </div>
          <Metro2VersionInfo />
        </TabsContent>

        <TabsContent value="validation-rules" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>
              Active Validation Rules ({Metro2Rules2025.version})
            </h2>
            <p className={styles.sectionText}>
              Filters below let you focus on highest-impact checks first. Each
              rule includes why it matters, what to check, source references,
              and field jump links.
            </p>
          </div>

          <div className={styles.ruleToolbar}>
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Search rules by name, category, or guidance..."
                value={ruleSearch}
                onChange={(event) => setRuleSearch(event.target.value)}
                className={styles.searchInput}
              />
            </div>
            <div className={styles.ruleFilterRow}>
              <select
                className={styles.segmentSelect}
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                aria-label="Rule category filter"
              >
                {ruleCategories.map((category) => (
                  <option key={category} value={category}>
                    {category === "All" ? "All Categories" : category}
                  </option>
                ))}
              </select>
              <select
                className={styles.segmentSelect}
                value={selectedSeverity}
                onChange={(event) =>
                  setSelectedSeverity(
                    event.target.value as ValidationSeverity | "All",
                  )
                }
                aria-label="Rule severity filter"
              >
                <option value="All">All Severities</option>
                <option value="ERROR">ERROR</option>
                <option value="WARNING">WARNING</option>
                <option value="INFO">INFO</option>
              </select>
              <select
                className={styles.segmentSelect}
                value={selectedImpact}
                onChange={(event) =>
                  setSelectedImpact(event.target.value as RuleImpact | "All")
                }
                aria-label="Rule impact filter"
              >
                <option value="All">All Impacts</option>
                <option value="Likely Violation">Likely Violation</option>
                <option value="Informational">Informational</option>
              </select>
              <select
                className={styles.segmentSelect}
                value={selectedConfidence}
                onChange={(event) =>
                  setSelectedConfidence(
                    event.target.value as RuleConfidence | "All",
                  )
                }
                aria-label="Rule confidence filter"
              >
                <option value="All">All Confidence</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
            <div className={styles.ruleActions}>
              <Button variant="secondary" size="sm" onClick={resetRuleFilters}>
                <RefreshCcw size={15} />
                Reset
              </Button>
              <Button variant="outline" size="sm" onClick={exportRulesCsv}>
                <Download size={15} />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={openPdfPreview}>
                <FileText size={15} />
                PDF Preview
              </Button>
            </div>
          </div>

          <div className={styles.ruleSummaryRow}>
            <Badge variant="primary">Rules: {filteredRules.length}</Badge>
            <Badge variant="error">
              Likely Violations:{" "}
              {
                filteredRules.filter(
                  (rule) => rule.impact === "Likely Violation",
                ).length
              }
            </Badge>
            <Badge variant="info">
              Informational:{" "}
              {
                filteredRules.filter((rule) => rule.impact === "Informational")
                  .length
              }
            </Badge>
            <Badge variant="success">
              Last Reviewed:{" "}
              {format(new Date(GUIDE_LAST_REVIEWED), "MMM d, yyyy")}
            </Badge>
          </div>

          {filteredRules.length === 0 ? (
            <div className={styles.emptyRuleState}>
              <AlertTriangle size={20} />
              <p>No rules match the current filters.</p>
            </div>
          ) : (
            <div className={styles.rulesGrid}>
              {Object.entries(groupedFilteredRules).map(([category, rules]) => (
                <div key={category} className={styles.ruleCategoryCard}>
                  <div className={styles.categoryHeader}>
                    <h3 className={styles.categoryTitle}>{category}</h3>
                    <span className={styles.ruleCount}>{rules.length} Rules</span>
                  </div>
                  <div className={styles.ruleList}>
                    {rules.map((rule) => (
                      <div key={rule.ruleName} className={styles.ruleItem}>
                        <div className={styles.ruleHeader}>
                          <span className={styles.ruleName}>{rule.ruleName}</span>
                          <div className={styles.ruleBadgeRow}>
                            <Badge variant={getSeverityBadgeVariant(rule.severity)}>
                              {rule.severity}
                            </Badge>
                            <Badge variant={getImpactBadgeVariant(rule.impact)}>
                              {rule.impact}
                            </Badge>
                            <Badge
                              variant={getConfidenceBadgeVariant(rule.confidence)}
                            >
                              {rule.confidence} Confidence
                            </Badge>
                          </div>
                        </div>
                        <p className={styles.ruleDescription}>
                          {rule.description}
                        </p>
                        <div className={styles.ruleDetailBlock}>
                          <h4 className={styles.ruleDetailTitle}>
                            Why It Matters
                          </h4>
                          <p className={styles.ruleDetailText}>
                            {rule.guidance.whyMatters}
                          </p>
                        </div>
                        <div className={styles.ruleDetailBlock}>
                          <h4 className={styles.ruleDetailTitle}>What To Check</h4>
                          <ul className={styles.ruleChecklist}>
                            {rule.guidance.whatToCheck.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        {rule.guidance.fieldRefs.length > 0 ? (
                          <div className={styles.ruleDetailBlock}>
                            <h4 className={styles.ruleDetailTitle}>
                              Field References
                            </h4>
                            <div className={styles.ruleFieldLinks}>
                              {rule.guidance.fieldRefs.map((fieldId) => (
                                <button
                                  key={`${rule.ruleName}-${fieldId}`}
                                  type="button"
                                  className={styles.fieldJumpButton}
                                  onClick={() => handleFieldJump(fieldId)}
                                >
                                  {fieldId}
                                  <ArrowRight size={14} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className={styles.ruleFooterMeta}>
                          <span>Last Reviewed: {rule.guidance.lastReviewed}</span>
                          <ul className={styles.ruleSourceList}>
                            {rule.guidance.sources.map((source, sourceIndex) => (
                              <li key={`${rule.ruleName}-source-${sourceIndex}`}>
                                {source.url ? (
                                  <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {source.label}
                                    <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  <span>{source.label}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.integrationLinks}>
            <h3>Connected Workflows</h3>
            <div className={styles.integrationLinkRow}>
              <Link to="/statutes" className={styles.integrationLink}>
                <Scale size={16} />
                Law Registry
              </Link>
              <Link to="/admin-letter-templates" className={styles.integrationLink}>
                <FileText size={16} />
                Letter Templates
              </Link>
              <Link to="/bureaus" className={styles.integrationLink}>
                <ShieldCheck size={16} />
                Bureau Records
              </Link>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="field-reference" className={styles.tabContent}>
          <div className={styles.filterBar}>
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Search fields by name, ID, or description..."
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                className={styles.searchInput}
              />
            </div>
            <div className={styles.segmentFilter}>
              <Filter size={16} className={styles.filterIcon} />
              <select
                value={selectedSegment}
                onChange={(event) => setSelectedSegment(event.target.value)}
                className={styles.segmentSelect}
              >
                {availableSegments.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment === "All" ? "All Segments" : segment}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.fieldTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Field Name</th>
                  <th>Segment</th>
                  <th>Type</th>
                  <th>Length</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.length > 0 ? (
                  filteredFields.map((field) => (
                    <tr
                      key={field.id}
                      className={
                        highlightedFieldId === field.id
                          ? styles.highlightedFieldRow
                          : undefined
                      }
                    >
                      <td className={styles.monoCell}>{field.id}</td>
                      <td className={styles.nameCell}>{field.name}</td>
                      <td>
                        <span className={styles.segmentBadge}>{field.segment}</span>
                      </td>
                      <td>{field.type}</td>
                      <td className={styles.centerCell}>{field.length}</td>
                      <td className={styles.centerCell}>
                        {field.required ? (
                          <CheckCircle2
                            size={16}
                            className={styles.requiredIcon}
                          />
                        ) : (
                          <span className={styles.optionalText}>-</span>
                        )}
                      </td>
                      <td className={styles.descCell}>{field.description}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      No fields found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="quick-check" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>2-Minute Rule Triage</h2>
            <p className={styles.sectionText}>
              Use this checklist before generating letters or escalating a
              report. It keeps review cycles consistent.
            </p>
          </div>

          <div className={styles.checklistSummary}>
            <div className={styles.progressHeader}>
              <span>
                Completed {checklistCompletedCount} of {QUICK_CHECK_ITEMS.length}
              </span>
              <span>{checklistProgressPercent}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${checklistProgressPercent}%` }}
              />
            </div>
            <div className={styles.ruleActions}>
              <Button variant="secondary" size="sm" onClick={resetChecklist}>
                <RefreshCcw size={15} />
                Reset Checklist
              </Button>
            </div>
          </div>

          <div className={styles.checklistGrid}>
            {QUICK_CHECK_ITEMS.map((item) => (
              <label key={item.id} className={styles.checklistItem}>
                <input
                  type="checkbox"
                  checked={Boolean(checklistState[item.id])}
                  onChange={() => toggleChecklistItem(item.id)}
                />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.check}</p>
                </div>
              </label>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cra-obligations" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>CRA Creditor Obligations</h2>
            <p className={styles.sectionText}>
              Under provincial Consumer Reporting Acts and PIPEDA, furnishers
              have legal duties to keep furnished data complete, accurate, and
              promptly corrected.
            </p>
          </div>

          <div className={styles.obligationsGrid}>
            {CraObligationTypeArrayValues.map((type) => (
              <div key={type} className={styles.obligationCard}>
                <div className={styles.obligationHeader}>
                  <Scale className={styles.obligationIcon} size={24} />
                  <h3 className={styles.obligationTitle}>
                    {type.replace(/_/g, " ")}
                  </h3>
                </div>
                <p className={styles.obligationDesc}>
                  {CRA_DESCRIPTIONS[type] || "No description available."}
                </p>
                <div className={styles.obligationFooter}>
                  <Link to="/statutes" className={styles.learnMoreLink}>
                    <FileText size={14} />
                    View Related Statutes
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="guide-changelog" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>Guide Change Log</h2>
            <p className={styles.sectionText}>
              Change entries track updates to this guide so release notes and
              reviewer expectations stay synchronized.
            </p>
          </div>
          <div className={styles.changelogList}>
            {GUIDE_CHANGE_LOG.map((entry) => (
              <div
                key={`${entry.date}-${entry.summary}`}
                className={styles.changelogItem}
              >
                <div className={styles.changelogMeta}>
                  <Badge variant="primary">{entry.date}</Badge>
                  <h3>{entry.summary}</h3>
                </div>
                <p>{entry.details}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
