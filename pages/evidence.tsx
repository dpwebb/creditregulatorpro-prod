import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Button } from "../components/Button";
import { useAuth } from "../helpers/useAuth";

import EvidenceEventsPage from "./evidence-events";
import EvidenceManagementPage from "./evidence-management";

import styles from "./evidence.module.css";

export default function EvidencePage() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "messages";

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Evidence & Timeline | Credit Regulator Pro</title>
      </Helmet>
      
      {!isAdmin && (
        <div className={styles.nextStepBanner}>
          <div className={styles.nextStepText}>
            Recorded all responses? Upload a new credit report to see what changed.
          </div>
          <Button asChild size="sm">
            <Link to="/upload">Upload New Report →</Link>
          </Button>
        </div>
      )}

      <Tabs value={currentTab} onValueChange={handleTabChange} className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="messages">Timeline</TabsTrigger>
            <TabsTrigger value="files">Files & Proof</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="messages">
          {currentTab === "messages" && <EvidenceEventsPage />}
        </TabsContent>
        <TabsContent value="files">
          {currentTab === "files" && <EvidenceManagementPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}