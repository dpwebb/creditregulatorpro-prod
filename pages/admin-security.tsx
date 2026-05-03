import { Helmet } from "react-helmet";
import * as Tabs from "@radix-ui/react-tabs";
import { ShieldAlert, FileClock, SearchCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { useAuth } from "../helpers/useAuth";

import { AuditLogViewer } from "../components/AuditLogViewer";
import { DataRetentionPanel } from "../components/DataRetentionPanel";
import { SemanticAuditPanel } from "../components/SemanticAuditPanel";
import { Skeleton } from "../components/Skeleton";
import styles from "./admin-security.module.css";

export default function AdminSecurityPage() {
  const { authState } = useAuth();
  

  if (authState.type === "loading") {
    return (
      <div className={styles.pageContainer}>
        <Skeleton style={{ height: "60px", width: "300px" }} />
        <Skeleton style={{ height: "400px", width: "100%" }} />
      </div>
    );
  }

  // AdminRoute ensures we are authenticated and admin here
  const user = authState.type === "authenticated" ? authState.user : null;

  return (
    <div className={styles.pageContainer}>
      <Helmet>
        <title>Security & Compliance | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Security & Compliance"
        subtitle="Monitor system activity and manage data retention policies."
        
        role={user?.role}
      />

      <Tabs.Root className={styles.tabsRoot} defaultValue="audit-logs">
        <Tabs.List className={styles.tabsList} aria-label="Security sections">
          <Tabs.Trigger className={styles.tabsTrigger} value="audit-logs">
            <ShieldAlert size={16} style={{ marginRight: 8 }} />
            Audit Logs
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tabsTrigger} value="data-retention">
            <FileClock size={16} style={{ marginRight: 8 }} />
            Data Retention
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tabsTrigger} value="semantic-audit">
            <SearchCheck size={16} style={{ marginRight: 8 }} />
            Semantic Audit
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content className={styles.tabsContent} value="audit-logs">
          <AuditLogViewer />
        </Tabs.Content>

        <Tabs.Content className={styles.tabsContent} value="data-retention">
          <DataRetentionPanel />
        </Tabs.Content>

        <Tabs.Content className={styles.tabsContent} value="semantic-audit">
          <SemanticAuditPanel />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}