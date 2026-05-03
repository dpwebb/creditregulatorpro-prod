import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Skeleton } from "../components/Skeleton";
import { ArrowLeft, FileText, User, CreditCard, Search, Scale } from "lucide-react";
import { useCaseReviewData } from "../helpers/useCaseReview";
import { ReviewField } from "../components/ReviewField";
import { FullDraftExtraction } from "../helpers/fullExtractionTypes";
import { PassADraftExtraction } from "../helpers/passAExtractorTypes";
import styles from "./cases.review.module.css";

export default function CaseReviewPage() {
  const [searchParams] = useSearchParams();
  const artifactId = parseInt(searchParams.get("artifactId") || "0", 10);
  
  const { data, isLoading, error } = useCaseReviewData(artifactId);

  if (isLoading) {
    return <ReviewLoadingState />;
  }

  if (error || !data?.ok) {
    return (
      <div className={styles.errorContainer}>
        <h2>Error loading review data</h2>
        <p>{error?.message || "Unknown error occurred"}</p>
        <Button asChild variant="outline">
          <Link to="/report-artifacts">Back to Artifacts</Link>
        </Button>
      </div>
    );
  }

  const { effectiveView, draftExtraction, isFullExtraction } = data;
  const fullEffective = isFullExtraction ? (effectiveView as FullDraftExtraction) : null;
  const fullDraft = isFullExtraction ? (draftExtraction as FullDraftExtraction) : null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Extraction Review"
        subtitle={`Reviewing data for Artifact #${artifactId}`}
        
      >
        <div className={styles.headerActions}>
          <Badge variant={isFullExtraction ? "primary" : "info"}>
            {isFullExtraction ? "Full Extraction (Pass A+)" : "Draft Extraction (Pass A)"}
          </Badge>
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" className={styles.tabs}>
        <TabsList>
          <TabsTrigger value="overview">
            <FileText size={16} className={styles.tabIcon} /> Overview
          </TabsTrigger>
          <TabsTrigger value="profile">
            <User size={16} className={styles.tabIcon} /> Consumer Profile
          </TabsTrigger>
          {isFullExtraction && (
            <>
              <TabsTrigger value="accounts">
                <CreditCard size={16} className={styles.tabIcon} /> Accounts
              </TabsTrigger>
              <TabsTrigger value="inquiries">
                <Search size={16} className={styles.tabIcon} /> Inquiries
              </TabsTrigger>
              <TabsTrigger value="public_records">
                <Scale size={16} className={styles.tabIcon} /> Public Records
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <div className={styles.contentArea}>
          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className={styles.tabContent}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Bureau Context</h3>
              <div className={styles.grid}>
                <ReviewField
                  artifactId={artifactId}
                  path="bureau_context.bureau_name"
                  label="Bureau Name"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                />
                <ReviewField
                  artifactId={artifactId}
                  path="bureau_context.report_date"
                  label="Report Date"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                  type="date"
                />
                <ReviewField
                  artifactId={artifactId}
                  path="bureau_context.reference_number"
                  label="Reference Number"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                />
              </div>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Portal Summary</h3>
              <div className={styles.grid}>
                <ReviewField
                  artifactId={artifactId}
                  path="portal_summary.credit_score"
                  label="Credit Score"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                  type="number"
                />
                <ReviewField
                  artifactId={artifactId}
                  path="portal_summary.total_accounts"
                  label="Total Accounts"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                  type="number"
                />
                <ReviewField
                  artifactId={artifactId}
                  path="portal_summary.total_inquiries"
                  label="Total Inquiries"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                  type="number"
                />
              </div>
            </div>
          </TabsContent>

          {/* CONSUMER PROFILE TAB */}
          <TabsContent value="profile" className={styles.tabContent}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Personal Information</h3>
              <div className={styles.grid}>
                <ReviewField
                  artifactId={artifactId}
                  path="consumer_profile.legal_name.given_name"
                  label="Given Name"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                />
                <ReviewField
                  artifactId={artifactId}
                  path="consumer_profile.legal_name.middle_name"
                  label="Middle Name"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                />
                <ReviewField
                  artifactId={artifactId}
                  path="consumer_profile.legal_name.surname"
                  label="Surname"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                />
                <ReviewField
                  artifactId={artifactId}
                  path="consumer_profile.date_of_birth"
                  label="Date of Birth"
                  effectiveData={effectiveView}
                  originalData={draftExtraction}
                  type="date"
                />
              </div>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Address History</h3>
              {effectiveView.consumer_profile.address_history.map((_, index) => (
                <div key={index} className={styles.card}>
                  <h4 className={styles.cardTitle}>Address #{index + 1}</h4>
                  <div className={styles.grid}>
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.address_history.${index}.address_line_1`}
                      label="Line 1"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.address_history.${index}.city`}
                      label="City"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.address_history.${index}.province`}
                      label="Province"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.address_history.${index}.postal_code`}
                      label="Postal Code"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Employment History</h3>
              {effectiveView.consumer_profile.employment_history.map((_, index) => (
                <div key={index} className={styles.card}>
                  <h4 className={styles.cardTitle}>Employment #{index + 1}</h4>
                  <div className={styles.grid}>
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.employment_history.${index}.employer_name`}
                      label="Employer"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                    <ReviewField
                      artifactId={artifactId}
                      path={`consumer_profile.employment_history.${index}.occupation`}
                      label="Occupation"
                      effectiveData={effectiveView}
                      originalData={draftExtraction}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ACCOUNTS TAB (Full Only) */}
          {isFullExtraction && fullEffective && fullDraft && (
            <TabsContent value="accounts" className={styles.tabContent}>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Tradelines ({fullEffective.accounts.length})</h3>
                {fullEffective.accounts.map((_, index) => (
                  <div key={index} className={styles.card}>
                    <h4 className={styles.cardTitle}>Account #{index + 1}</h4>
                    <div className={styles.grid}>
                      <ReviewField
                        artifactId={artifactId}
                        path={`accounts.${index}.creditor_name`}
                        label="Creditor Name"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                      />
                      <ReviewField
                        artifactId={artifactId}
                        path={`accounts.${index}.account_number_partial`}
                        label="Account Number"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                      />
                      <ReviewField
                        artifactId={artifactId}
                        path={`accounts.${index}.account_type`}
                        label="Type"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                      />
                      <ReviewField
                        artifactId={artifactId}
                        path={`accounts.${index}.balance`}
                        label="Balance"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                        type="number"
                      />
                      <ReviewField
                        artifactId={artifactId}
                        path={`accounts.${index}.status`}
                        label="Status"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          {/* INQUIRIES TAB (Full Only) */}
          {isFullExtraction && fullEffective && fullDraft && (
            <TabsContent value="inquiries" className={styles.tabContent}>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Credit Inquiries</h3>
                {fullEffective.inquiries_credit_related.map((_, index) => (
                  <div key={index} className={styles.card}>
                    <div className={styles.grid}>
                      <ReviewField
                        artifactId={artifactId}
                        path={`inquiries_credit_related.${index}.inquirer_name`}
                        label="Inquirer"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                      />
                      <ReviewField
                        artifactId={artifactId}
                        path={`inquiries_credit_related.${index}.inquiry_date`}
                        label="Date"
                        effectiveData={fullEffective}
                        originalData={fullDraft}
                        type="date"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}

          {/* PUBLIC RECORDS TAB (Full Only) */}
          {isFullExtraction && fullEffective && fullDraft && (
            <TabsContent value="public_records" className={styles.tabContent}>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Public Records</h3>
                {fullEffective.insolvency_public_records.records.length === 0 ? (
                  <p className={styles.emptyState}>No public records found.</p>
                ) : (
                  fullEffective.insolvency_public_records.records.map((_, index) => (
                    <div key={index} className={styles.card}>
                      <div className={styles.grid}>
                        <ReviewField
                          artifactId={artifactId}
                          path={`insolvency_public_records.records.${index}.record_type`}
                          label="Type"
                          effectiveData={fullEffective}
                          originalData={fullDraft}
                        />
                        <ReviewField
                          artifactId={artifactId}
                          path={`insolvency_public_records.records.${index}.filing_date`}
                          label="Filing Date"
                          effectiveData={fullEffective}
                          originalData={fullDraft}
                          type="date"
                        />
                        <ReviewField
                          artifactId={artifactId}
                          path={`insolvency_public_records.records.${index}.status`}
                          label="Status"
                          effectiveData={fullEffective}
                          originalData={fullDraft}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function ReviewLoadingState() {
  return (
    <div className={styles.page}>
      <div style={{ marginBottom: "2rem" }}>
        <Skeleton style={{ width: "200px", height: "32px", marginBottom: "8px" }} />
        <Skeleton style={{ width: "300px", height: "20px" }} />
      </div>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <Skeleton style={{ width: "100px", height: "40px" }} />
        <Skeleton style={{ width: "100px", height: "40px" }} />
        <Skeleton style={{ width: "100px", height: "40px" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
        <Skeleton style={{ height: "200px" }} />
        <Skeleton style={{ height: "200px" }} />
      </div>
    </div>
  );
}