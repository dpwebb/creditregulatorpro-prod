import React from "react";
import { Link } from "react-router-dom";
import { 
  ShieldAlert, 
  AlertTriangle, 
  Info, 
  FileText, 
  Building2, 
  Landmark, 
  Gavel,
  ArrowRight,
  Scale,
  Target
} from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { BureauBadge } from "./BureauBadge";
import { OutputType } from "../endpoints/upload-results/get_GET.schema";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./Accordion";
import { formatCurrency } from "../helpers/formatters";
import styles from "./UploadScanSummary.module.css";

interface UploadScanSummaryProps {
  data: OutputType;
  isLoading?: boolean;
  artifactId: number;
}

export const UploadScanSummary: React.FC<UploadScanSummaryProps> = ({ 
  data, 
  isLoading,
  artifactId 
}) => {
  if (isLoading) {
    return <UploadScanSummarySkeleton />;
  }

  const { stats, topFindings, challengeAccessPoints } = data;
  const hasViolations = stats.highSeverity + stats.mediumSeverity + stats.lowSeverity > 0;
  const hasProceduralPoints = challengeAccessPoints && challengeAccessPoints.length > 0;
  const isFollowUp = !!data.crossReference;
  const hasParserReview = Boolean(data.parserQuality?.requiresManualReview);

  // Determine gauge color based on threat score
  const getScoreColor = (score: number) => {
    if (score < 30) return "var(--success)";
    if (score < 60) return "var(--warning)";
    return "var(--error)";
  };

  const scoreColor = getScoreColor(stats.threatScore);

  const getGaugeDescription = () => {
    if (hasParserReview) return "This report needs parser review before relying on the scan.";
    if (stats.threatScore > 60) return "We found serious problems. You should act now.";
    if (stats.threatScore > 30) return "We found some problems.";
    if (!hasViolations && hasProceduralPoints) return "No mistakes in the data, but you can still challenge how they reported it.";
    return "Things look good! Keep checking back.";
  };

  const renderParserQualityNotice = () => {
    if (!data.parserQuality?.requiresManualReview) return null;

    return (
      <div className={styles.bannerCard}>
        <div className={styles.bannerHeader}>
          <h3 className={styles.bannerTitle}>Report Parser Review Needed</h3>
          <p className={styles.bannerSubtitle}>
            Parser confidence: {data.parserQuality.confidenceScore}/100. Review the original PDF before using these results in a dispute packet.
          </p>
        </div>
        <div className={styles.bannerStats}>
          {data.parserQuality.issues.slice(0, 4).map((issue) => (
            <div
              key={issue.code}
              className={`${styles.bannerStatItem} ${issue.severity === "ERROR" ? styles.statWarning : styles.statMuted}`}
            >
              <AlertTriangle size={16} />
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentScan = () => (
    <>
      {renderParserQualityNotice()}

      {/* Top Section: Gauge & Key Stats */}
      <div className={styles.topSection}>
        <div className={styles.gaugeCard}>
          <h3 className={styles.cardTitle}>Problem Score</h3>
          <div className={styles.gaugeContainer}>
            <svg viewBox="0 0 100 50" className={styles.gaugeSvg}>
              <path d="M 10 50 A 40 40 0 0 1 90 50" className={styles.gaugeBg} />
              <path 
                d="M 10 50 A 40 40 0 0 1 90 50" 
                className={styles.gaugeFill}
                strokeDasharray="126"
                strokeDashoffset={126 - (126 * stats.threatScore / 100)}
                style={{ stroke: scoreColor }}
              />
            </svg>
            <div className={styles.scoreValue} style={{ color: scoreColor }}>
              {stats.threatScore}
            </div>
            <div className={styles.scoreLabel}>/ 100</div>
          </div>
          <p className={styles.gaugeDescription}>
            {getGaugeDescription()}
          </p>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIconWrapper} style={{ background: "rgba(var(--primary-rgb), 0.1)" }}>
              <FileText size={20} className={styles.statIcon} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Total Accounts</span>
              <span className={styles.statValue}>{stats.totalTradelines}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrapper} style={{ background: "rgba(239, 68, 68, 0.1)" }}>
              <ShieldAlert size={20} className={styles.statIcon} style={{ color: "var(--error)" }} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Serious</span>
              <span className={styles.statValue} style={{ color: "var(--error)" }}>{stats.highSeverity}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrapper} style={{ background: "rgba(245, 158, 11, 0.1)" }}>
              <AlertTriangle size={20} className={styles.statIcon} style={{ color: "var(--warning)" }} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Moderate</span>
              <span className={styles.statValue} style={{ color: "var(--warning)" }}>{stats.mediumSeverity}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIconWrapper} style={{ background: "rgba(59, 130, 246, 0.1)" }}>
              <Info size={20} className={styles.statIcon} style={{ color: "var(--info)" }} />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statLabel}>Minor</span>
              <span className={styles.statValue} style={{ color: "var(--info)" }}>{stats.lowSeverity}</span>
            </div>
          </div>

          {(stats.equifaxViolations > 0 || stats.transunionViolations > 0) && (
            <>
              {stats.equifaxViolations > 0 && (
                <div className={styles.statCard}>
                  <div className={styles.statIconWrapper} style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)" }}>
                    <Building2 size={20} style={{ color: "var(--warning)" }} />
                  </div>
                  <div className={styles.statContent}>
                    <span className={styles.statLabel}><BureauBadge bureauName="Equifax" size="sm" /></span>
                    <span className={styles.statValue}>{stats.equifaxViolations}</span>
                  </div>
                </div>
              )}
              {stats.transunionViolations > 0 && (
                <div className={styles.statCard}>
                  <div className={styles.statIconWrapper} style={{ background: "color-mix(in srgb, var(--info) 15%, transparent)" }}>
                    <Building2 size={20} style={{ color: "var(--info)" }} />
                  </div>
                  <div className={styles.statContent}>
                    <span className={styles.statLabel}><BureauBadge bureauName="TransUnion" size="sm" /></span>
                    <span className={styles.statValue}>{stats.transunionViolations}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Middle Section: Entity Breakdown & Actionable */}
      <div className={styles.middleSection}>
        <div className={styles.breakdownCard}>
          <h3 className={styles.cardTitle}>Who Is Responsible</h3>
          <div className={styles.breakdownList}>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>
                <Building2 size={16} /> Credit Bureau Mistakes
              </div>
              <div className={styles.breakdownValue}>{stats.bureauViolations}</div>
            </div>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>
                <Landmark size={16} /> Creditor Mistakes
              </div>
              <div className={styles.breakdownValue}>{stats.creditorViolations}</div>
            </div>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>
                <Gavel size={16} /> Collector Mistakes
              </div>
              <div className={styles.breakdownValue}>{stats.collectorViolations}</div>
            </div>
          </div>
        </div>

        <div className={`${styles.actionableCard} ${stats.actionableCount > 0 ? styles.hasActionable : (!hasViolations && hasProceduralPoints ? styles.hasProcedural : '')}`}>
          <div className={styles.actionableContent}>
            <div className={styles.actionableHeader}>
              <h3 className={styles.cardTitle}>What You Can Do</h3>
              {hasParserReview ? (
                <Badge variant="warning" className={styles.pulseBadge}>
                  Review Needed
                </Badge>
              ) : stats.actionableCount > 0 ? (
                <Badge variant="error" className={styles.pulseBadge}>
                  {stats.actionableCount} Issues
                </Badge>
              ) : hasProceduralPoints ? (
                 <Badge variant="info" className={styles.pulseBadge}>
                  Procedural Vectors
                </Badge>
              ) : null}
            </div>
            <p className={styles.actionableText}>
              {hasParserReview
                ? "The parser could not fully trust this upload. Check the source PDF before creating letters."
                : stats.actionableCount > 0 
                ? "We found serious problems you can dispute right now."
                : !hasViolations && hasProceduralPoints
                  ? "No data mistakes found, but you can still challenge how they handled things."
                  : "Nothing urgent right now. Keep checking."}
            </p>
            <div className={styles.actionButtons}>
              {hasParserReview && stats.totalTradelines === 0 ? (
                <>
                  <Button asChild variant="primary" size="lg" className={styles.primaryActionBtn}>
                    <Link to="/upload">
                      Upload a Cleaner PDF <ArrowRight size={16} />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/report-artifacts">View Report</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="primary" size="lg" className={styles.primaryActionBtn}>
                    <Link to={`/upload-review/${artifactId}`}>
                      Write a Dispute Letter Now <ArrowRight size={16} />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/my-accounts">See Your Accounts</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Top Findings Preview */}
      {topFindings.length > 0 && (
        <div className={styles.findingsSection}>
          <h3 className={styles.sectionTitle}>Most Important Problems</h3>
          <div className={styles.findingsList}>
          {topFindings.map((finding) => (
              <Link key={finding.id} to={`/tradelines/${finding.tradelineId}`} className={styles.findingRow}>
                <div className={styles.findingSeverity}>
                  {finding.severity === "HIGH" || finding.severity === "ERROR" ? (
                    <ShieldAlert size={18} className={styles.iconHigh} />
                  ) : finding.severity === "MEDIUM" || finding.severity === "WARNING" ? (
                    <AlertTriangle size={18} className={styles.iconMedium} />
                  ) : (
                    <Info size={18} className={styles.iconLow} />
                  )}
                </div>
                <div className={styles.findingDetails}>
                  <div className={styles.findingCreditorWrapper}>
                    <span className={styles.findingCreditor}>{finding.creditorName}</span>
                    {finding.bureauName && <BureauBadge bureauName={finding.bureauName} size="sm" />}
                  </div>
                  <span className={styles.findingCategory}>{finding.violationCategory.replace(/_/g, " ")}</span>
                </div>
                <div className={styles.findingAccount}>
                  #{finding.accountNumber}
                </div>
                <ArrowRight size={14} className={styles.findingArrow} />
              </Link>
            ))}
          </div>
          <div className={styles.viewAllLink}>
            <Link to={`/upload-review/${artifactId}`}>See all problems &rarr;</Link>
          </div>
        </div>
      )}

      {/* Procedural Challenges Section */}
      {hasProceduralPoints && (
        <div className={styles.proceduralSection}>
          <div className={styles.proceduralHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Other Ways to Challenge</h3>
              <p className={styles.sectionSubtitle}>These don't depend on mistakes in the data</p>
            </div>
          </div>
          
          <div className={styles.proceduralGrid}>
            {challengeAccessPoints.map((point) => (
              <div key={point.id} className={styles.proceduralCard}>
                <div className={styles.proceduralCardHeader}>
                  <div className={styles.proceduralIconWrapper}>
                    {point.entityType === "BUREAU" && <Building2 size={18} />}
                    {point.entityType === "CREDITOR" && <Landmark size={18} />}
                    {point.entityType === "COLLECTOR" && <Gavel size={18} />}
                  </div>
                  <div className={styles.proceduralBadges}>
                    <Badge variant="default" className={styles.tinyBadge}>{point.entityType}</Badge>
                    <Badge 
                      variant={
                        point.priority === "HIGH" ? "error" : 
                        point.priority === "MEDIUM" ? "warning" : "info"
                      }
                      className={`${styles.tinyBadge} ${point.priority === "HIGH" ? styles.pulseBadge : ''}`}
                    >
                      {point.priority}
                    </Badge>
                  </div>
                </div>
                
                <h4 className={styles.proceduralTitle}>{point.label}</h4>
                <p className={styles.proceduralDescription}>{point.description}</p>
                
                <div className={styles.proceduralFooter}>
                  <div className={styles.statutoryRef}>
                    <Scale size={12} /> {point.statutoryBasis}
                  </div>
                  <div className={styles.applicability}>
                    <Target size={12} /> {point.applicability}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (isFollowUp && data.crossReference) {
    const outcome = data.disputeOutcomeSummary;
    
    const removedAfterDisputeAccounts = data.crossReference.removed.filter(a => a.disputeActivity && a.disputeActivity.length > 0);
    const unchangedAfterDisputeAccounts = data.crossReference.matched.filter(a => a.disputeActivity && a.disputeActivity.length > 0 && (a.changes.length === 0 || a.changes.every(c => c.oldValue === null)));
    const changedAccounts = data.crossReference.matched.filter(a => a.changes.length > 0 && a.changes.some(c => c.oldValue !== null));
    const unexplainedRemovalsAccounts = data.crossReference.removed.filter(a => !a.disputeActivity || a.disputeActivity.length === 0);
    const newAccounts = data.crossReference.added;
    const noChangesAccounts = data.crossReference.matched.filter(a => (!a.disputeActivity || a.disputeActivity.length === 0) && (a.changes.length === 0 || a.changes.every(c => c.oldValue === null)));

    return (
      <div className={styles.container}>
        {/* Section 1: Dispute Outcome Banner */}
        {outcome && outcome.totalDisputesSent > 0 && (
          <div className={styles.bannerCard}>
            <div className={styles.bannerHeader}>
              <h3 className={styles.bannerTitle}>What Happened With Your Disputes</h3>
              <p className={styles.bannerSubtitle}>Based on {outcome.totalDisputesSent} dispute packet(s) sent since {new Date(data.crossReference.previousUploadDate).toLocaleDateString()}</p>
            </div>
            <div className={styles.bannerStats}>
              {outcome.removedAfterDispute > 0 && (
                <div className={`${styles.bannerStatItem} ${styles.statSuccess}`}>
                  <span className={styles.bannerStatIcon}>🎉</span>
                  <span>{outcome.removedAfterDispute} account(s) removed after your disputes</span>
                </div>
              )}
              {outcome.changedAfterDispute > 0 && (
                <div className={`${styles.bannerStatItem} ${styles.statInfo}`}>
                  <span className={styles.bannerStatIcon}>📝</span>
                  <span>{outcome.changedAfterDispute} account(s) changed after your disputes</span>
                </div>
              )}
              {outcome.unchangedAfterDispute > 0 && (
                <div className={`${styles.bannerStatItem} ${styles.statWarning}`}>
                  <span className={styles.bannerStatIcon}>⚠️</span>
                  <span>{outcome.unchangedAfterDispute} disputed account(s) show no changes yet — may need escalation</span>
                </div>
              )}
              {outcome.removedUnexplained > 0 && (
                <div className={`${styles.bannerStatItem} ${styles.statMuted}`}>
                  <span className={styles.bannerStatIcon}>❓</span>
                  <span>{outcome.removedUnexplained} account(s) removed without a dispute on file</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 2: Account-by-Account Breakdown */}
        <div className={styles.followupSection}>
          <h3 className={styles.sectionTitle}>Your Accounts — What Changed</h3>
          
          <div className={styles.groupedList}>
            {removedAfterDisputeAccounts.length > 0 && (
              <div className={`${styles.groupCard} ${styles.groupWins}`}>
                <h4 className={styles.groupTitle}>Wins — Removed!</h4>
                {removedAfterDisputeAccounts.map(account => (
                  <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItem}>
                    <div className={styles.groupedItemHeader}>
                      <span className={styles.groupedItemCreditor}>{account.creditorName}</span>
                      {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                    </div>
                    <div className={styles.groupedItemNoteSuccess}>
                      Disputed via Packet {account.disputeActivity?.map(a => `#${a.packetId}`).join(', ')}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {unchangedAfterDisputeAccounts.length > 0 && (
              <div className={`${styles.groupCard} ${styles.groupNeedsAttention}`}>
                <h4 className={styles.groupTitle}>Needs Attention — No Changes Yet</h4>
                {unchangedAfterDisputeAccounts.map(account => (
                  <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItem}>
                    <div className={styles.groupedItemHeader}>
                      <span className={styles.groupedItemCreditor}>{account.creditorName}</span>
                      {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                    </div>
                    <div className={styles.groupedItemNoteWarning}>
                      Disputed via Packet {account.disputeActivity?.map(a => `#${a.packetId}`).join(', ')} — no response detected
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {changedAccounts.length > 0 && (
              <div className={`${styles.groupCard} ${styles.groupChanges}`}>
                <h4 className={styles.groupTitle}>Changes Detected</h4>
                {changedAccounts.map(account => (
                  <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItem}>
                    <div className={styles.groupedItemHeader}>
                      <span className={styles.groupedItemCreditor}>{account.creditorName}</span>
                      {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                    </div>
                    <div className={styles.changesList}>
                      {account.changes.map((change, idx) => (
                        <div key={idx} className={styles.changeRow}>
                          <span className={styles.changeField}>{change.field.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>: 
                          <span className={styles.oldValue}>{change.oldValue || "N/A"}</span>
                          <ArrowRight size={12} className={styles.changeArrow} />
                          <span className={styles.newValue}>{change.newValue || "N/A"}</span>
                        </div>
                      ))}
                    </div>
                    {account.disputeActivity && account.disputeActivity.length > 0 && (
                      <div className={styles.groupedItemNoteInfo}>
                        Changes may reflect dispute outcome (Packet {account.disputeActivity.map(a => `#${a.packetId}`).join(', ')})
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}

            {unexplainedRemovalsAccounts.length > 0 && (
              <div className={`${styles.groupCard} ${styles.groupUnexplained}`}>
                <h4 className={styles.groupTitle}>Removed (We Don't Know Why)</h4>
                {unexplainedRemovalsAccounts.map(account => (
                  <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItem}>
                    <div className={styles.groupedItemHeader}>
                      <span className={styles.groupedItemCreditor}>{account.creditorName}</span>
                      {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                    </div>
                    <div className={styles.groupedItemNoteMuted}>
                      No dispute was sent — investigate why this was removed
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {newAccounts.length > 0 && (
              <div className={`${styles.groupCard} ${styles.groupNeutral}`}>
                <h4 className={styles.groupTitle}>New Accounts</h4>
                {newAccounts.map(account => (
                  <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItem}>
                    <div className={styles.groupedItemHeader}>
                      <span className={styles.groupedItemCreditor}>{account.creditorName}</span>
                      {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                    </div>
                    <div className={styles.groupedItemDetails}>
                      Balance: {formatCurrency(account.currentBalance ?? 0)} • Status: {account.status || "N/A"}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {noChangesAccounts.length > 0 && (
              <Accordion type="single" collapsible className={styles.noChangesAccordion}>
                <AccordionItem value="no-changes">
                  <AccordionTrigger className={styles.noChangesTrigger}>
                    No Changes ({noChangesAccounts.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className={styles.groupedListContent}>
                      {noChangesAccounts.map(account => (
                        <Link to={`/tradelines/${account.tradelineId}`} key={account.tradelineId} className={styles.groupedItemLight}>
                          <span>{account.creditorName}</span>
                          {data.metadata.bureauName && <BureauBadge bureauName={data.metadata.bureauName} size="sm" />}
                        </Link>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>

        {/* Section 3: What To Do Next */}
        <div className={styles.followupSection}>
          <h3 className={styles.sectionTitle}>What To Do Next</h3>
          <div className={styles.actionCardsGrid}>
            {unchangedAfterDisputeAccounts.length > 0 && (
              <div className={styles.actionCard}>
                <h4>Send Stronger Letters</h4>
                <p>Send escalation packets for accounts that didn't respond</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/packets">Go to Packets</Link>
                </Button>
              </div>
            )}
            {removedAfterDisputeAccounts.length > 0 && (
              <div className={styles.actionCard}>
                <h4>Save Your Wins</h4>
                <p>Document your wins in the evidence log</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/evidence">Go to Evidence</Link>
                </Button>
              </div>
            )}
            {topFindings.length > 0 && (
              <div className={styles.actionCard}>
                <h4>Look at New Problems</h4>
                <p>Review new problems found in this report</p>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/upload-review/${artifactId}`}>Review Problems</Link>
                </Button>
              </div>
            )}
            <div className={styles.actionCard}>
              <h4>Keep Going</h4>
              <p>Upload another report to track further changes</p>
              <Button asChild variant="outline" size="sm">
                <Link to="/upload">Upload Report</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Section 4: This Report's Scan */}
        <Accordion type="single" collapsible className={styles.scanResultsAccordion}>
          <AccordionItem value="scan-results">
            <AccordionTrigger className={styles.scanResultsTrigger}>
              Full Details
            </AccordionTrigger>
            <AccordionContent>
              <div className={styles.scanResultsContent}>
                {renderCurrentScan()}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  // First-upload mode
  return (
    <div className={styles.container}>
      {renderCurrentScan()}
    </div>
  );
};

const UploadScanSummarySkeleton = () => (
  <div className={styles.container}>
    <div className={styles.topSection}>
      <div className={styles.gaugeCard}>
        <Skeleton style={{ width: "150px", height: "20px", marginBottom: "20px" }} />
        <Skeleton style={{ width: "200px", height: "100px", margin: "0 auto" }} />
      </div>
      <div className={styles.statsGrid}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={styles.statCard}>
            <Skeleton style={{ width: "40px", height: "40px", borderRadius: "8px" }} />
            <div style={{ flex: 1 }}>
              <Skeleton style={{ width: "80px", height: "14px", marginBottom: "8px" }} />
              <Skeleton style={{ width: "40px", height: "24px" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className={styles.middleSection}>
      <Skeleton style={{ height: "200px", width: "100%", borderRadius: "12px" }} />
      <Skeleton style={{ height: "200px", width: "100%", borderRadius: "12px" }} />
    </div>
  </div>
);
