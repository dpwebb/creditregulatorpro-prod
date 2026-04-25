import React from "react";
import { Helmet } from "react-helmet";
import { ShieldCheck } from "lucide-react";
import { ComplianceAuditViewer } from "../components/ComplianceAuditViewer";
import { ComplianceAuditDocs } from "../components/ComplianceAuditDocs";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { HelpTooltip } from "../components/HelpTooltip";
import { useToast } from "../helpers/useToast"; // Importing to have ready for future use

import styles from "./compliance-audit.module.css";

export default function ComplianceAuditPage() {
  

  return (
    <>
      <Helmet>
        <title>Compliance Audit Trail | Credit Regulator Pro</title>
        <meta 
          name="description" 
          content="Track regulatory compliance and evidence chains for all packets." 
        />
      </Helmet>

      <div className={styles.pageContainer}>
        
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <div className={styles.iconBox}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className={styles.title}>
                Compliance Audit Trail
                <HelpTooltip 
                  title="Audit Trail System"
                  content="Immutable record of all compliance actions, regulatory checks, and evidence gathering events. Used for regulatory reporting and internal audits."
                  className={styles.titleHelp}
                />
              </h1>
              <p className={styles.description}>
                Track which regulations were applied to each packet with evidence chain integration.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="trail" className={styles.tabs}>
          <TabsList>
            <TabsTrigger value="trail">
              Audit Trail
              <HelpTooltip 
                content="Live view of compliance events and infraction detections."
                size={14}
                className={styles.tabHelp}
              />
            </TabsTrigger>
            <TabsTrigger value="docs">
              Documentation
              <HelpTooltip 
                content="Generated compliance reports and certificates."
                size={14}
                className={styles.tabHelp}
              />
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="trail" className={styles.tabContent}>
            <ComplianceAuditViewer />
          </TabsContent>
          
          <TabsContent value="docs" className={styles.tabContent}>
            <ComplianceAuditDocs />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}