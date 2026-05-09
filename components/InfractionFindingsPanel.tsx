import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  Gavel, 
  Filter,
  Download,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { InfractionFinding, InfractionSeverity } from "../helpers/regulationInfractionScanner";
import { useCreateChallengeFromInfraction, useBulkCreateChallenges, CreateChallengeInput } from "../helpers/infractionQueries";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "./Table";
import styles from "./InfractionFindingsPanel.module.css";

interface InfractionFindingsPanelProps {
  findings: InfractionFinding[];
  // onChallenge and onChallengeAllHigh are now handled internally via hooks
  onChallenge?: (finding: InfractionFinding) => void;
  onChallengeAllHigh?: () => void;
}

export const InfractionFindingsPanel = ({ 
  findings, 
  onChallenge: externalOnChallenge,
  onChallengeAllHigh: externalOnChallengeAllHigh 
}: InfractionFindingsPanelProps) => {
  const [filterType, setFilterType] = useState<"ALL" | "BUREAU" | "FURNISHER">("ALL");
  const navigate = useNavigate();
  
  // Hooks for challenging
  const createChallenge = useCreateChallengeFromInfraction();
  const bulkCreateChallenges = useBulkCreateChallenges();

  const filteredFindings = findings.filter(f => {
    if (filterType === "ALL") return true;
    if (filterType === "BUREAU") return f.infractionType === "BUREAU_VIOLATION";
    if (filterType === "FURNISHER") return f.infractionType === "CREDITOR_VIOLATION";
    return true;
  });

  const stats = {
    total: findings.length,
    high: findings.filter(f => f.severity === "HIGH").length,
    medium: findings.filter(f => f.severity === "MEDIUM").length,
    low: findings.filter(f => f.severity === "LOW").length,
    bureau: findings.filter(f => f.infractionType === "BUREAU_VIOLATION").length,
    creditor: findings.filter(f => f.infractionType === "CREDITOR_VIOLATION").length,
  };

  const getSeverityIcon = (severity: InfractionSeverity) => {
    switch (severity) {
      case "HIGH": return <ShieldAlert className={styles.iconHigh} size={18} />;
      case "MEDIUM": return <AlertTriangle className={styles.iconMedium} size={18} />;
      case "LOW": return <Info className={styles.iconLow} size={18} />;
    }
  };

  const getSeverityBadgeVariant = (severity: InfractionSeverity) => {
    switch (severity) {
      case "HIGH": return "error";
      case "MEDIUM": return "warning";
      case "LOW": return "info";
    }
  };

  const handleChallenge = (finding: InfractionFinding) => {
    if (externalOnChallenge) {
      externalOnChallenge(finding);
      return;
    }

    if (!finding.tradelineId || !finding.creditorId) {
      toast.error("Cannot challenge: Finding is missing linked record IDs (Tradeline or Creditor).");
      return;
    }

    createChallenge.mutate({
      infractionFinding: finding,
      tradelineId: finding.tradelineId,
      creditorId: finding.creditorId,
    }, {
      onSuccess: () => {
        toast.success(`Challenge initiated: ${finding.suggestedDisputeVector}`);
      },
      onError: (error) => {
        toast.error(`Failed to create challenge: ${error.message}`);
      }
    });
  };

  const handleChallengeAllHigh = () => {
    if (externalOnChallengeAllHigh) {
      externalOnChallengeAllHigh();
      return;
    }

    const actionableHighFindings = findings.filter(
      f => f.severity === "HIGH" && f.tradelineId && f.creditorId
    );

    if (actionableHighFindings.length === 0) {
      toast.info("No actionable high-severity findings (missing linked record IDs).");
      return;
    }

    const challenges: CreateChallengeInput[] = actionableHighFindings.map(f => ({
      infractionFinding: f,
      tradelineId: f.tradelineId!,
      creditorId: f.creditorId!
    }));

    const totalHigh = findings.filter(f => f.severity === "HIGH").length;
    const skippedCount = totalHigh - challenges.length;

    if (skippedCount > 0) {
      toast.warning(`Skipping ${skippedCount} high-severity findings due to missing database IDs.`);
    }

    toast.promise(
      bulkCreateChallenges.mutateAsync({ challenges }),
      {
        loading: `Processing ${challenges.length} challenges...`,
        success: (data) => {
          // Navigate to creditor validations page after successful bulk creation
          setTimeout(() => {
            navigate("/my-accounts?tab=problems");
          }, 1000);
          return `Successfully created ${data.results.length} challenges. Redirecting...`;
        },
        error: "Failed to process bulk challenges."
      }
    );
  };

  return (
    <div className={styles.container}>
      {/* Summary Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Findings</span>
          <span className={styles.statValue}>{stats.total}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>High Severity</span>
          <span className={`${styles.statValue} ${styles.textHigh}`}>{stats.high}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Bureau Findings</span>
          <span className={styles.statValue}>{stats.bureau}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Creditor Findings</span>
          <span className={styles.statValue}>{stats.creditor}</span>
        </div>
        
        {stats.high > 0 && (
          <div className={styles.actionCard}>
            <Button 
              variant="destructive" 
              className={styles.bulkButton}
              onClick={handleChallengeAllHigh}
              disabled={bulkCreateChallenges.isPending}
            >
              {bulkCreateChallenges.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Gavel size={16} />
              )}
              {bulkCreateChallenges.isPending ? "Processing..." : `Challenge All High (${stats.high})`}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <Filter size={16} className={styles.filterIcon} />
          <button 
            className={`${styles.filterTab} ${filterType === "ALL" ? styles.active : ""}`}
            onClick={() => setFilterType("ALL")}
          >
            All Findings
          </button>
          <button 
            className={`${styles.filterTab} ${filterType === "BUREAU" ? styles.active : ""}`}
            onClick={() => setFilterType("BUREAU")}
          >
            Bureau Only
          </button>
          <button 
            className={`${styles.filterTab} ${filterType === "FURNISHER" ? styles.active : ""}`}
            onClick={() => setFilterType("FURNISHER")}
          >
            Creditor Only
          </button>
        </div>
        
        <Button variant="outline" size="sm" className={styles.downloadButton}>
          <Download size={14} /> Export Report
        </Button>
      </div>

      {/* Findings Table */}
      <TableContainer className={styles.tableContainer}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Finding</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFindings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className={styles.emptyStateContainer}>
                    <CheckCircle2 size={48} className={styles.emptyIcon} />
                    <h3 className={styles.emptyTitle}>No Automated Findings Detected</h3>
                    <p className={styles.emptyDescription}>
                      While no obvious compliance findings were found, you can still proceed with our obligation testing framework.
                    </p>
                    
                    <div className={styles.baselineInfo}>
                      <p>
                        <strong>Strategic Path Available:</strong> Even without specific compliance findings, you can initiate baseline procedural challenges using our 4-sequence rotation strategy:
                      </p>
                      <ul className={styles.vectorList}>
                        <li>Authority to Report & Permissible Purpose</li>
                        <li>Verification Method & Completeness Attestation</li>
                        <li>Accuracy Attestation & Investigation Procedure</li>
                        <li>Timing Compliance</li>
                      </ul>
                    </div>

                    <div className={styles.emptyActions}>
                      <Button asChild variant="primary">
                        <Link to="/my-accounts">
                          Proceed with Baseline Challenges
                        </Link>
                      </Button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredFindings.map((finding, idx) => (
                <TableRow key={idx} className={styles.row}>
                  <TableCell>
                    <div className={styles.severityCell}>
                      {getSeverityIcon(finding.severity)}
                      <Badge variant={getSeverityBadgeVariant(finding.severity)} className={styles.badge}>
                        {finding.severity}
                      </Badge>
                    </div>
                  </TableCell>
                                    <TableCell>
                    <div className={styles.accountCell}>
                      {finding.tradelineId ? (
                        <Link to={`/tradelines/${finding.tradelineId}`} className={styles.creditorLink}>
                          {finding.creditorName}
                        </Link>
                      ) : (
                        <span className={styles.creditor}>{finding.creditorName}</span>
                      )}
                      <span className={styles.accountNum}>#{finding.accountNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.violationCell}>
                      <span className={styles.violationTitle}>{finding.violationCategory.replace(/_/g, " ")}</span>
                      <span className={styles.fcraRef}>{finding.fcraSection}</span>
                      <span className={styles.violationDesc}>{finding.description}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className={styles.evidenceCode}>{finding.evidenceDetails}</code>
                  </TableCell>
                  <TableCell>
                    {finding.autoChallengeable ? (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className={styles.challengeButton}
                        onClick={() => handleChallenge(finding)}
                        disabled={createChallenge.isPending || !finding.tradelineId || !finding.creditorId}
                        title={(!finding.tradelineId || !finding.creditorId) ? "Record IDs missing" : "Launch challenge"}
                      >
                        {createChallenge.isPending ? <Loader2 className="animate-spin" size={14} /> : <Gavel size={14} />}
                        Challenge
                      </Button>
                    ) : (
                      <span className={styles.manualReview}>Manual Review</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};
