import { useState } from "react";
import { format } from "../helpers/dateUtils";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ComparisonSummary } from "../helpers/parserPatternAnalyzer";
import { FieldExpectation } from "../helpers/parserValidationModes";
import { ParserPatternSuggestions } from "./ParserPatternSuggestions";
import { FieldApprovalDialog } from "./FieldApprovalDialog";
import { ResultRow } from "./ParserTestResultRow";
import { TradelineResultCard } from "./ParserTestTradelineCard";
import { ActualDataRow } from "./ParserTestActualDataRow";
import { ActualAddressCard } from "./ParserTestActualAddressCard";
import { ActualTradelineCard } from "./ParserTestActualTradelineCard";
import styles from "./ParserTestResultsPanel.module.css";

interface ParserTestResultsPanelProps {
  summary: ComparisonSummary;
  lastRunAt?: string | Date;
  onAcceptResults?: () => void;
  onApproveField?: (
    fieldType: "consumerInfo" | "tradeline",
    id: string,
    expectation: FieldExpectation
  ) => void;
}

export function ParserTestResultsPanel({
  summary,
  lastRunAt,
  onAcceptResults,
  onApproveField,
}: ParserTestResultsPanelProps) {
  const passed = summary.passed;
  const needsReview = summary.needsReview;
  const hasExpectations = summary.hasExpectations;

  // State for approval dialog
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalFieldInfo, setApprovalFieldInfo] = useState<{
    fieldType: "consumerInfo" | "tradeline";
    fieldName: string;
    extractedValue: any;
  } | null>(null);

  const openApprovalDialog = (
    fieldType: "consumerInfo" | "tradeline",
    fieldName: string,
    extractedValue: any
  ) => {
    setApprovalFieldInfo({
      fieldType,
      fieldName,
      extractedValue,
    });
    setApprovalDialogOpen(true);
  };

  const handleApprovalSave = (expectation: FieldExpectation) => {
    if (approvalFieldInfo && onApproveField) {
      onApproveField(
        approvalFieldInfo.fieldType,
        approvalFieldInfo.fieldName,
        expectation
      );
    }
  };

  const comparedFields = new Set(
    summary.consumerInfoResults.map((r) => r.fieldName)
  );
  const wasCompared = (field: string) => comparedFields.has(field);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>Test Results</h3>
          {passed ? (
            needsReview ? (
              <Badge variant="warning">PASSED - Needs Review</Badge>
            ) : (
              <Badge variant="success">PASSED</Badge>
            )
          ) : (
            <Badge variant="error">FAILED</Badge>
          )}
        </div>
        {lastRunAt && (
          <span className={styles.timestamp}>
            Run at: {format(new Date(lastRunAt), "MMM d, yyyy HH:mm:ss")}
          </span>
        )}
      </div>

      <div className={styles.content}>
        {/* Warning when no expectations are set */}
        {!hasExpectations && (
          <div className={styles.warningBanner}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <div className={styles.warningContent}>
              <strong>No expected values configured.</strong>
              <span>
                Review the extracted data below. If it looks correct, click
                'Accept as Expected' to set the baseline or approve fields
                individually.
              </span>
            </div>
          </div>
        )}

        {/* Warning when expectations exist but there are unapproved fields */}
        {hasExpectations && needsReview && passed && (
          <div className={styles.warningBanner}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <div className={styles.warningContent}>
              <strong>Needs Review</strong>
              <span>
                Some extracted data has not been approved as baseline. Approve
                all fields to complete test coverage.
              </span>
            </div>
          </div>
        )}

        {/* 1. Consumer Info Section */}
        {hasExpectations && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              Consumer Information Comparison
            </h4>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.consumerInfoResults.map((result, idx) => (
                    <ResultRow
                      key={idx}
                      result={result}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          result.fieldName,
                          result.actual
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Actual Consumer Info */}
        {summary.actualConsumerInfo && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              {hasExpectations
                ? "Additional Extracted Fields"
                : "Extracted Consumer Information"}
            </h4>
            <div className={styles.actualDataCard}>
              <table className={styles.table}>
                <tbody>
                  {(!hasExpectations || !wasCompared("fullName")) && (
                    <ActualDataRow
                      label="Full Name"
                      value={summary.actualConsumerInfo.fullName}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "fullName",
                          summary.actualConsumerInfo?.fullName
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("addressLine1")) && (
                    <ActualDataRow
                      label="Address Line 1"
                      value={summary.actualConsumerInfo.addressLine1}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "addressLine1",
                          summary.actualConsumerInfo?.addressLine1
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("addressLine2")) && (
                    <ActualDataRow
                      label="Address Line 2"
                      value={summary.actualConsumerInfo.addressLine2}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "addressLine2",
                          summary.actualConsumerInfo?.addressLine2
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("city")) && (
                    <ActualDataRow
                      label="City"
                      value={summary.actualConsumerInfo.city}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "city",
                          summary.actualConsumerInfo?.city
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("province")) && (
                    <ActualDataRow
                      label="Province"
                      value={summary.actualConsumerInfo.province}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "province",
                          summary.actualConsumerInfo?.province
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("postalCode")) && (
                    <ActualDataRow
                      label="Postal Code"
                      value={summary.actualConsumerInfo.postalCode}
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "postalCode",
                          summary.actualConsumerInfo?.postalCode
                        )
                      }
                    />
                  )}
                  {(!hasExpectations || !wasCompared("dateOfBirth")) && (
                    <ActualDataRow
                      label="Date of Birth"
                      value={
                        summary.actualConsumerInfo.dateOfBirth
                          ? format(
                              new Date(summary.actualConsumerInfo.dateOfBirth),
                              "MMM d, yyyy"
                            )
                          : null
                      }
                      onApprove={() =>
                        openApprovalDialog(
                          "consumerInfo",
                          "dateOfBirth",
                          summary.actualConsumerInfo?.dateOfBirth
                        )
                      }
                    />
                  )}
                  <ActualDataRow
                    label="Confidence"
                    value={`${summary.actualConsumerInfo.confidence}%`}
                  />
                </tbody>
              </table>
            </div>

            {/* Previous Addresses */}
            {summary.actualConsumerInfo.previousAddresses &&
              summary.actualConsumerInfo.previousAddresses.length > 0 && (
                <div className={styles.subSection}>
                  <h5 className={styles.subSectionTitle}>
                    Previous Addresses (
                    {summary.actualConsumerInfo.previousAddresses.length})
                  </h5>
                  <div className={styles.tradelinesList}>
                    {summary.actualConsumerInfo.previousAddresses.map(
                      (addr: any, idx: number) => (
                        <ActualAddressCard
                          key={idx}
                          address={addr}
                          index={idx}
                          onApprove={() =>
                            openApprovalDialog(
                              "consumerInfo",
                              "previousAddresses",
                              summary.actualConsumerInfo?.previousAddresses
                            )
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* 3. Tradeline Comparison Results */}
        {hasExpectations && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Tradelines Comparison</h4>
            <div className={styles.tradelinesList}>
              {summary.tradelineResults.map((tlResult, idx) => {
                const actualTl = summary.actualTradelines?.find(
                  (t) => t.accountNumber === tlResult.accountNumber
                );
                // For failing tradelines, we might want to approve the whole thing or specific fields.
                // Currently, let's keep it simple and approve at tradeline level (which overwrites with current values)
                return (
                  <TradelineResultCard
                    key={idx}
                    result={tlResult}
                    onApprove={() =>
                      openApprovalDialog(
                        "tradeline",
                        tlResult.accountNumber || String(idx),
                        actualTl
                      )
                    }
                  />
                );
              })}
              {summary.tradelineResults.length === 0 && (
                <div className={styles.emptyState}>
                  No tradeline expectations set
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. All Extracted Tradelines */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            Extracted Tradelines ({summary.actualTradelines?.length || 0})
          </h4>
          <div className={styles.tradelinesList}>
            {summary.actualTradelines && summary.actualTradelines.length > 0 ? (
              summary.actualTradelines.map((tradeline, idx) => (
                <ActualTradelineCard
                  key={idx}
                  tradeline={tradeline}
                  onApprove={() =>
                    openApprovalDialog(
                      "tradeline",
                      tradeline.accountNumber || String(idx),
                      tradeline
                    )
                  }
                />
              ))
            ) : (
              <div className={styles.emptyState}>No tradelines extracted</div>
            )}
          </div>
        </div>

        {/* 5. Suggestions */}
        {!passed && Object.keys(summary.patternSuggestions).length > 0 && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Pattern Suggestions</h4>
            <ParserPatternSuggestions suggestions={summary.patternSuggestions} />
          </div>
        )}

        {/* 6. Actions */}
        {onAcceptResults && (!passed || !hasExpectations) && (
          <div className={`${styles.section} ${styles.actionsSection}`}>
            <h4 className={styles.sectionTitle}>Actions</h4>
            <div className={styles.actionCard}>
              <div className={styles.actionInfo}>
                <span className="font-medium text-sm">
                  Update Expected Values
                </span>
                <span className="text-xs text-muted-foreground">
                  {!hasExpectations
                    ? "Accept ALL extracted data above as the baseline for future test runs."
                    : "If the actual results above are correct, accept them as the new baseline."}
                </span>
              </div>
              <Button onClick={onAcceptResults} size="sm">
                <CheckCircle size={16} /> Accept All Results as Expected
              </Button>
            </div>
          </div>
        )}
      </div>

      {approvalFieldInfo && (
        <FieldApprovalDialog
          open={approvalDialogOpen}
          onOpenChange={setApprovalDialogOpen}
          fieldName={approvalFieldInfo.fieldName}
          extractedValue={approvalFieldInfo.extractedValue}
          fieldType={approvalFieldInfo.fieldType}
          onApprove={handleApprovalSave}
        />
      )}
    </div>
  );
}