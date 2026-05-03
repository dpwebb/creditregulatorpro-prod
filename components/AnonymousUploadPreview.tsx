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
  problemCount: number;
  sampleProblems: (string | SampleProblem)[];
}

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          {problemCount > 0 ? (
            <ShieldAlert size={32} className={styles.alertIcon} />
          ) : (
            <CheckCircle2 size={32} className={styles.successIcon} />
          )}
        </div>
        <h2 className={styles.title}>
          {problemCount > 0
            ? `We found ${problemCount} potential ${
                problemCount === 1 ? "problem" : "problems"
              } in your report.`
            : "Initial scan complete. Deep analysis pending."}
        </h2>
        <p className={styles.subtitle}>
          Here's what we spotted in your report:
        </p>
      </div>

      {sampleProblems.length > 0 && (
        <ul className={styles.problemList}>
          {sampleProblems.map((problem, idx) => {
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
                            <Badge variant="error">⚠️ Bureau error found</Badge>
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
          {problemCount > 0
            ? "Create an account to view all issues and generate legal dispute letters."
            : "Create an account to run deep Metro-2 compliance checks and find hidden violations."}
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
