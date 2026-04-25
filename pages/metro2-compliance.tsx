import React, { useState, useMemo, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Search,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  FileText,
  Scale,
  History,
  Filter,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Metro2VersionInfo } from "../components/Metro2VersionInfo";
import {
  Metro2Rules2025,
  Metro2ValidationRule,
} from "../helpers/metro2ValidationRules";
import {
  CraObligationTypeArrayValues,
  CraObligationType,
} from "../helpers/schema";

import { useAuth } from "../helpers/useAuth";
import { Skeleton } from "../components/Skeleton";
import styles from "./metro2-compliance.module.css";

// --- Local Data & Types for Field Reference ---

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
    description: "C (Line of Credit), I (Installment), M (Mortgage), O (Open), R (Revolving).",
  },
  {
    id: "Base-7",
    name: "Account Type",
    segment: "Base",
    type: "Alphanumeric",
    length: 2,
    required: true,
    description: "Code indicating the specific type of account (e.g., 01 for Auto, 18 for Credit Card).",
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
    description: "Current status of the account (e.g., 11 for Current, 13 for Paid).",
  },
  {
    id: "Base-15",
    name: "Payment Rating",
    segment: "Base",
    type: "Alphanumeric",
    length: 1,
    required: false,
    description: "Rating of the payment history (e.g., 0 for Current, 1 for 30 days late).",
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
    description: "The date the first delinquency occurred that led to the current status.",
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
    "Under provincial Consumer Reporting Acts, creditors (creditors and data providers) must establish and implement reasonable written policies and procedures regarding the accuracy and integrity of the information relating to consumers that they furnish to a consumer reporting agency.",
  CORRECTION_DUTY:
    "If a creditor determines that information it has furnished is not complete or accurate, it must promptly notify the CRA of that determination and provide the corrections to that information.",
  DATA_VALIDATION:
    "Creditors must validate the data they report, ensuring it conforms to the Metro 2 format and accurately reflects the consumer's account status and history.",
  DISPUTE_INVESTIGATION:
    "Upon receiving a notice of dispute from a CRA, creditors must conduct an investigation with respect to the disputed information, review all relevant information provided, and report the results to the CRA.",
  DOFD_REPORTING:
    "Creditors must report the Date of First Delinquency (DOFD) for accounts that are reported as delinquent, charged to profit and loss, or placed for collection/charge-off.",
  MONTHLY_REPORTING:
    "While not strictly mandated by provincial CRA to report every month, industry standards (Metro 2) require complete and accurate reporting for every cycle to maintain the integrity of the credit file.",
};

export default function Metro2CompliancePage() {
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedSegment, setSelectedSegment] = useState<string>("All");
  
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

  // Group rules by category
  const rulesByCategory = useMemo(() => {
    const groups: Record<string, Metro2ValidationRule[]> = {};
    Metro2Rules2025.rules.forEach((rule) => {
      if (!groups[rule.category]) {
        groups[rule.category] = [];
      }
      groups[rule.category].push(rule);
    });
    return groups;
  }, []);

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
        subtitle="Comprehensive reference for credit reporting standards, validation rules, and CRA obligations."
        
        role={authState.user.role}
      />

      <Tabs defaultValue="version-history" className={styles.tabs}>
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
          <TabsTrigger value="cra-obligations">
            <Scale size={16} className={styles.tabIcon} />
            CRA Obligations
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: VERSION HISTORY */}
        <TabsContent value="version-history" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>Metro 2 Format Evolution</h2>
            <p className={styles.sectionText}>
              The Metro 2® Format is the standard format for reporting consumer
              credit information to the four major credit reporting agencies. It
              is designed to allow for the reporting of the most accurate and
              complete information on consumers' credit history.
            </p>
          </div>
          <Metro2VersionInfo />
        </TabsContent>

        {/* TAB 2: VALIDATION RULES */}
        <TabsContent value="validation-rules" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>
              Active Validation Rules (2025)
            </h2>
            <p className={styles.sectionText}>
              These rules are automatically applied to all uploaded report
              artifacts to ensure compliance and data integrity.
            </p>
          </div>

          <div className={styles.rulesGrid}>
            {Object.entries(rulesByCategory).map(([category, rules]) => (
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
                        <span
                          className={`${styles.severityBadge} ${styles[rule.severity.toLowerCase()]}`}
                        >
                          {rule.severity}
                        </span>
                      </div>
                      <p className={styles.ruleDescription}>
                        {rule.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: FIELD REFERENCE */}
        <TabsContent value="field-reference" className={styles.tabContent}>
          <div className={styles.filterBar}>
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Search fields by name, ID, or description..."
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <div className={styles.segmentFilter}>
              <Filter size={16} className={styles.filterIcon} />
              <select
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className={styles.segmentSelect}
              >
                <option value="All">All Segments</option>
                <option value="Base">Base Segment</option>
                <option value="J1">J1 (Assoc. Consumer)</option>
                <option value="J2">J2 (Assoc. Consumer)</option>
                <option value="K1">K1 (Original Creditor)</option>
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
                    <tr key={field.id}>
                      <td className={styles.monoCell}>{field.id}</td>
                      <td className={styles.nameCell}>{field.name}</td>
                      <td>
                        <span className={styles.segmentBadge}>
                          {field.segment}
                        </span>
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

        {/* TAB 4: CRA OBLIGATIONS */}
        <TabsContent value="cra-obligations" className={styles.tabContent}>
          <div className={styles.introSection}>
            <h2 className={styles.sectionTitle}>CRA Creditor Obligations</h2>
            <p className={styles.sectionText}>
          Under provincial Consumer Reporting Acts and PIPEDA, creditors and other data reporters
              information to consumer reporting agencies have specific legal
              obligations to ensure accuracy and integrity.
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
                  <a href="#" className={styles.learnMoreLink}>
                    <FileText size={14} />
                    View Related Statutes
                  </a>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}