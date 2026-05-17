import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { generateAdminKnowledgeBasePdf } from "../helpers/adminKnowledgeBasePdfGenerator";

import { KBAdminOverview } from "../components/KBAdminOverview";
import { KBAdminUsers } from "../components/KBAdminUsers";
import { KBAdminCompliance } from "../components/KBAdminCompliance";
import { KBAdminVersions } from "../components/KBAdminVersions";
import { KBAdminParserTesting } from "../components/KBAdminParserTesting";
import { KBAdminOperations } from "../components/KBAdminOperations";
import { KBAdminLicensedAgencies } from "../components/KBAdminLicensedAgencies";
import { KBAdminFeatureIndex } from "../components/KBAdminFeatureIndex";

import styles from "./admin-knowledge-base.module.css";

export default function AdminKnowledgeBasePage() {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await generateAdminKnowledgeBasePdf();
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title="Admin Guide"
        subtitle="Reference documentation for platform administration, admin features, and platform functions."
      >
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            <Download size={16} />
            {isGeneratingPdf ? "Generating..." : "Download Admin Guide as PDF"}
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="compliance">Compliance Config</TabsTrigger>
            <TabsTrigger value="versions">Version Management</TabsTrigger>
            <TabsTrigger value="parser">Parser Testing</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="agencies">Licensed Agencies</TabsTrigger>
            <TabsTrigger value="feature-index">Feature Index</TabsTrigger>
          </TabsList>
        </div>

        <div className={styles.contentWrapper}>
          <TabsContent value="overview">
            <KBAdminOverview />
          </TabsContent>

          <TabsContent value="users">
            <KBAdminUsers />
          </TabsContent>

          <TabsContent value="compliance">
            <KBAdminCompliance />
          </TabsContent>

          <TabsContent value="versions">
            <KBAdminVersions />
          </TabsContent>

          <TabsContent value="parser">
            <KBAdminParserTesting />
          </TabsContent>

          <TabsContent value="operations">
            <KBAdminOperations />
          </TabsContent>

          <TabsContent value="agencies">
            <KBAdminLicensedAgencies />
          </TabsContent>

          <TabsContent value="feature-index">
            <KBAdminFeatureIndex />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
