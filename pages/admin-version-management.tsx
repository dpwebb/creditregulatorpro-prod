import React from "react";
import { PageHeader } from "../components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { AdminVersionTab } from "../components/AdminVersionTab";
import { AdminMigrationTab } from "../components/AdminMigrationTab";
import { AdminFeatureFlagTab } from "../components/AdminFeatureFlagTab";
import { GitMerge, Database, ToggleRight } from "lucide-react";
import styles from "./admin-version-management.module.css";

export default function AdminVersionManagementPage() {
  return (
    <div className={styles.container}>
      <PageHeader
        title="Version Management"
        subtitle="Manage software releases, database migrations, and feature toggles."
      />

      <Tabs defaultValue="versions" className={styles.tabsContainer}>
        <TabsList>
          <TabsTrigger value="versions" className={styles.tabTrigger}>
            <GitMerge size={16} className={styles.tabIcon} />
            Versions
          </TabsTrigger>
          <TabsTrigger value="migrations" className={styles.tabTrigger}>
            <Database size={16} className={styles.tabIcon} />
            Migrations
          </TabsTrigger>
          <TabsTrigger value="feature-flags" className={styles.tabTrigger}>
            <ToggleRight size={16} className={styles.tabIcon} />
            Feature Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className={styles.tabContent}>
          <AdminVersionTab />
        </TabsContent>

        <TabsContent value="migrations" className={styles.tabContent}>
          <AdminMigrationTab />
        </TabsContent>

        <TabsContent value="feature-flags" className={styles.tabContent}>
          <AdminFeatureFlagTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}