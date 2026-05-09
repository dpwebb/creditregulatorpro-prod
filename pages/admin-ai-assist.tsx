import { AdminAiAssistTab } from "../components/AdminAiAssistTab";
import { PageHeader } from "../components/PageHeader";
import styles from "./admin-version-management.module.css";

export default function AdminAiAssistPage() {
  return (
    <div className={styles.container}>
      <PageHeader
        title="AI Assist"
        subtitle="Admin-only guarded AI checks, finding lookup, and explanation previews."
      />
      <div className={styles.tabsContainer}>
        <AdminAiAssistTab />
      </div>
    </div>
  );
}
