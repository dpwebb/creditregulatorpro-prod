import React, { useState } from "react";
import { PlayCircle, Download, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { HelpTooltip } from "../components/HelpTooltip";
import { useOnboarding } from "../helpers/useOnboarding";
import { generateKnowledgeBasePdf } from "../helpers/knowledgeBasePdfGenerator";

import { KBGettingStarted } from "../components/KBGettingStarted";
import { KBTradelines } from "../components/KBTradelines";
import { KBEvidence } from "../components/KBEvidence";
import { KBPackets } from "../components/KBPackets";
import { KBHumanRights } from "../components/KBHumanRights";
import { KBCompliance } from "../components/KBCompliance";
import { KBRulesRegulations } from "../components/KBRulesRegulations";
import { KBObligations } from "../components/KBObligations";
import { KBBureausCreditors } from "../components/KBBureausCreditors";
import { KBAnalytics } from "../components/KBAnalytics";
import { KBSecurity } from "../components/KBSecurity";
import { KBUploadReports } from "../components/KBUploadReports";
import { KBIdentityTheft } from "../components/KBIdentityTheft";
import { KBBankruptcy } from "../components/KBBankruptcy";
import { KBAccountBilling } from "../components/KBAccountBilling";
import { KBSupportGuide } from "../components/KBSupportGuide";
import { KnowledgeBaseSection } from "../components/KnowledgeBaseSection";
import { useAuth } from "../helpers/useAuth";
import styles from "./user-manual.module.css";

export default function UserManualPage() {
  const { startTour } = useOnboarding();
  const { userRole } = useAuth();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      // Small delay to allow React to paint the "Generating..." state
      await new Promise((resolve) => setTimeout(resolve, 50));
      generateKnowledgeBasePdf();
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="How to Use This App"
        subtitle="Everything you need to know about using Credit Regulator Pro."
        
      >
        <div className={styles.headerActions}>
          
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className={styles.tourButton}
          >
            <Download size={16} />
            {isGeneratingPdf ? "Generating..." : "Download Guide as PDF"}
          </Button>
          <Button variant="outline" onClick={startTour} className={styles.tourButton}>
            <PlayCircle size={16} />
            Take a Tour
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="getting-started" className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="getting-started">
              Getting Started
              <HelpTooltip
                content="Basics of using the platform."
                className={styles.tabTooltip}
                size={12}
              />
            </TabsTrigger>
            <TabsTrigger value="upload-reports">Upload & Reports</TabsTrigger>
            <TabsTrigger value="tradelines">Accounts</TabsTrigger>
            <TabsTrigger value="evidence">Proof & Files</TabsTrigger>
            <TabsTrigger value="packets">
              Dispute Letters
              <HelpTooltip
                content="Managing compliance packets and submissions."
                className={styles.tabTooltip}
                size={12}
              />
            </TabsTrigger>
            <TabsTrigger value="human-rights">Human Rights</TabsTrigger>
            <TabsTrigger value="identity-theft">Identity Theft</TabsTrigger>
            <TabsTrigger value="bankruptcy">Bankruptcy</TabsTrigger>
            <TabsTrigger value="compliance">
              Rule Checks
              <HelpTooltip
                content="Regulatory compliance tracking and audit trails."
                className={styles.tabTooltip}
                size={12}
              />
            </TabsTrigger>
            <TabsTrigger value="rules-laws">Laws & Statutes</TabsTrigger>
            <TabsTrigger value="obligations">Challenges & Strategy</TabsTrigger>
            <TabsTrigger value="bureaus">Companies</TabsTrigger>
            <TabsTrigger value="analytics">Progress</TabsTrigger>
            <TabsTrigger value="hidden-risks">Hidden Risks</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="account-billing">Account & Billing</TabsTrigger>
            {(userRole === "admin" || userRole === "support") && (
              <TabsTrigger value="support-guide">Support Guide</TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className={styles.contentWrapper}>
          <TabsContent value="getting-started">
            <KBGettingStarted />
          </TabsContent>

          <TabsContent value="upload-reports">
            <KBUploadReports />
          </TabsContent>

          <TabsContent value="tradelines">
            <KBTradelines />
          </TabsContent>

          <TabsContent value="evidence">
            <KBEvidence />
          </TabsContent>

          <TabsContent value="packets">
            <KBPackets />
          </TabsContent>

          <TabsContent value="human-rights">
            <KBHumanRights />
          </TabsContent>

          <TabsContent value="identity-theft">
            <KBIdentityTheft />
          </TabsContent>

          <TabsContent value="bankruptcy">
            <KBBankruptcy />
          </TabsContent>

          <TabsContent value="compliance">
            <KBCompliance />
          </TabsContent>

          <TabsContent value="rules-laws">
            <KBRulesRegulations />
          </TabsContent>

          <TabsContent value="obligations">
            <KBObligations />
          </TabsContent>

          <TabsContent value="bureaus">
            <KBBureausCreditors />
          </TabsContent>

          <TabsContent value="analytics">
            <KBAnalytics />
          </TabsContent>

          <TabsContent value="hidden-risks">
            <KnowledgeBaseSection
              title="Hidden Risk Register"
              icon={AlertTriangle}
              badge="PREVENTATIVE"
              badgeVariant="warning"
            >
              <p>
                Credit Regulator Pro continuously analyzes your credit reports to identify risks that are not obvious at first glance. These hidden risks might be accounts that could become problems later, such as debts approaching the statute of limitations, inconsistent reporting patterns, or accounts with suspicious activities.
              </p>
              <p>
                The system flags these risks proactively so you can take action before they cause damage to your credit profile or trigger aggressive collection efforts.
              </p>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/">Go to Dashboard</Link>
              </Button>
            </KnowledgeBaseSection>
          </TabsContent>

          <TabsContent value="security">
            <KBSecurity />
          </TabsContent>

          <TabsContent value="account-billing">
            <KBAccountBilling />
          </TabsContent>

          {(userRole === "admin" || userRole === "support") && (
            <TabsContent value="support-guide">
              <KBSupportGuide />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}