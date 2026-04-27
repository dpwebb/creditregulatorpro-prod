import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { PageHeader } from "../components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";

import { ParserMappingTable } from "../components/ParserMappingTable";
import { ParserMappingTestPanel } from "../components/ParserMappingTestPanel";
import { ParserMappingHistory } from "../components/ParserMappingHistory";
import { BureauDetectionConfigPanel } from "../components/BureauDetectionConfigPanel";

import styles from "./admin-parser-mappings.module.css";

export default function AdminParserMappingsPage() {
  const [activeTab, setActiveTab] = useState("field-mappings");

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Parser Mapping Configuration | Credit Regulator Pro Admin</title>
      </Helmet>

      <PageHeader
        title="Parser Mapping Configuration"
        subtitle="Configure how credit report fields are mapped and parsed per bureau."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.tabs}>
        <TabsList>
          <TabsTrigger value="field-mappings">Field Mappings</TabsTrigger>
          <TabsTrigger value="test-harness">Test Harness</TabsTrigger>
          <TabsTrigger value="change-history">Change History</TabsTrigger>
          <TabsTrigger value="bureau-detection">Bureau Detection</TabsTrigger>
        </TabsList>

        <TabsContent value="field-mappings" className={styles.tabContent}>
          <ParserMappingTable />
        </TabsContent>

        <TabsContent value="test-harness" className={styles.tabContent}>
          <ParserMappingTestPanel />
        </TabsContent>

        <TabsContent value="change-history" className={styles.tabContent}>
          <ParserMappingHistory />
        </TabsContent>

        <TabsContent value="bureau-detection" className={styles.tabContent}>
          <BureauDetectionConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}