import React from "react";
import {
  ShieldAlert,
  CheckCircle2,
  Lock,
  AlertTriangle,
  DollarSign,
  FileWarning,
  Scale,
  Info,
  Copy,
  Lightbulb,
  Clock,
} from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Link } from "react-router-dom";
import styles from "./AnonymousUploadPreview.module.css";

export type SampleProblem = {
  type: string;
  title: string;
  detail: string;
  solution?: string;
    urgency?: string;
};

interface AnonymousUploadPreviewProps {
  problemCount?: number | null;
  sampleProblems: (string | SampleProblem)[];
}

const PREVIEW_FINDING_LIMIT = 3;

const getProblemDetails = (problem: string | SampleProblem) => {
  if (typeof problem === "string") {
    return {
      title: problem,
      detail: "",
      type: "unknown",
      icon: <Info size={20} />,
      accentClass: styles.accentUnknown,
    };
  }

  switch (problem.type) {
    case "sol_expired":
      return {
        ...problem,
        icon: <Clock size={20} />,
        accentClass: styles.accentDerogatory,
      };
    case "sol_approaching":
      return {
        ...problem,
        icon: <Clock size={20} />,
        accentClass: styles.accentPastDue,
      };
    case "missing_dates":
      return {
        ...problem,
        icon: <AlertTriangle size={20} />,
        accentClass: styles.accentDerogatory,
      };
    case "date_logic":
      return {
        ...problem,
        icon: <FileWarning size={20} />,
        accentClass: styles.accentDerogatory,
      };
    case "status_inconsistency":
      return {
        ...problem,
        icon: <AlertTriangle size={20} />,
        accentClass: styles.accentPastDue,
      };
    case "collection":
    case "collection_account":
      return {
        ...problem,
        icon: <AlertTriangle size={20} />,
        accentClass: styles.accentCollection,
      };
    case "pastDue":
    case "past_due":
      return {
        ...problem,
        icon: <DollarSign size={20} />,
        accentClass: styles.accentPastDue,
      };
    case "derogatory":
    case "derogatory_status":
      return {
        ...problem,
        icon: <FileWarning size={20} />,
        accentClass: styles.accentDerogatory,
      };
    case "publicRecord":
    case "public_record":
      return {
        ...problem,
        icon: <Scale size={20} />,
        accentClass: styles.accentPublicRecord,
      };
    case "duplicate":
      return {
        ...problem,
        icon: <Copy size={20} />,
        accentClass: styles.accentDuplicate,
      };
    case "info":
    case "info_deep_scan":
    default:
      return {
        ...problem,
        icon: <Info size={20} />,
        accentClass: styles.accentInfo,
      };
  }
};

export const AnonymousUploadPreview: React.FC<AnonymousUploadPreviewProps> = ({
  problemCount,
  sampleProblems,
}) => {
  const totalFindings =
    typeof problemCount === "number" && Number.isFinite(problemCount)
      ? Math.max(0, problemCount)
      : null;
  const previewProblems = sampleProblems.slice(0, PREVIEW_FINDING_LIMIT);
  const previewShown =
    totalFindings === null
      ? previewProblems.length
      : Math.min(totalFindings, previewProblems.length);
  const hasKnownAdditionalFindings =
    totalFindings !== null && totalFindings > previewShown;
  const hasDetectedFindings =
    totalFindings === null ? previewProblems.length > 0 : totalFindings > 0;
  const previewSummary =
    previewShown > 0
      ? `Showing ${previewShown} sample ${
          previewShown === 1 ? "finding" : "findings"
        } from your report preview.`
      : "No sample findings are shown in this preview.";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          {hasDetectedFindings ? (
            <ShieldAlert size={32} className={styles.alertIcon} />
          ) : (
            <CheckCircle2 size={32} className={styles.successIcon} />
          )}
        </div>
        <h2 className={styles.title}>Preliminary scan complete.</h2>
        <div
          className={styles.summaryBlock}
          role="note"
          aria-label="Preview findings summary"
        >
          <p className={styles.subtitle}>{previewSummary}</p>
          {hasKnownAdditionalFindings && (
            <p className={styles.additionalNotice}>
              Your report has additional findings not shown in this preview.
            </p>
          )}
          {totalFindings === null && (
            <p className={styles.additionalNotice}>
              Additional findings may be available after secure account
              creation.
            </p>
          )}
          {totalFindings !== null && (
            <div className={styles.countSummary}>
              <span>Findings detected: {totalFindings}</span>
              <span>Preview shown: {previewShown}</span>
            </div>
          )}
        </div>
      </div>

      {previewProblems.length > 0 && (
        <ul className={styles.problemList}>
          {previewProblems.map((problem, idx) => {
            const { title, detail, icon, accentClass } =
              getProblemDetails(problem);
            const p = typeof problem === "object" ? problem : null;

            return (
              <li key={idx} className={styles.problemItem}>
                <div className={`${styles.problemCard} ${accentClass}`}>
                  <div className={styles.cardIconWrapper}>
                    <div className={styles.cardIcon}>{icon}</div>
                  </div>
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitle}>{title}</div>
                      {p?.urgency && (
                        <div className={styles.urgencyBadge}>
                          {p.urgency === "expired" && (
                            <Badge variant="success">⏰ Expired — removal eligible</Badge>
                          )}
                          {p.urgency === "approaching" && (
                            <Badge variant="warning">⏳ Expiring soon</Badge>
                          )}
                          {p.urgency === "violation" && (
                            <Badge variant="error">Priority finding</Badge>
                          )}
                          {p.urgency === "warning" && (
                            <Badge variant="default">⚡ Potential issue</Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {detail && <div className={styles.cardDetail}>{detail}</div>}
                  </div>
                </div>
                {p?.solution && (
                  <div className={styles.solutionCard}>
                    <Lightbulb size={18} className={styles.solutionIcon} />
                    <span className={styles.solutionText}>{p.solution}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.gateBox}>
        <Lock size={24} className={styles.lockIcon} />
        <h3 className={styles.gateTitle}>Unlock Your Full Report</h3>
        <p className={styles.gateSubtitle}>
          {hasDetectedFindings
            ? "Create an account to view all findings and generate draft dispute letters."
            : "Create an account to run deeper Metro-2 compliance checks and review possible findings."}
        </p>
        <div className={styles.actions}>
          <Button asChild size="lg" className={styles.ctaButton}>
            <Link to="/register">Start Free Trial</Link>
          </Button>
          <span className={styles.guarantee}>
            No charge for 7 days. Cancel anytime.
          </span>
        </div>
      </div>
    </div>
  );
};
