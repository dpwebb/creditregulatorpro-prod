import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import TradelinesPage from "./tradelines-tab";
import CreditorValidationsPage from "./creditor-validations";
import ReportArtifactsPage from "./report-artifacts";
import { useBankruptcyList } from "../helpers/bankruptcyQueries";

import styles from "./my-accounts.module.css";

export default function MyAccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "accounts";

  const { data: bankruptcyData } = useBankruptcyList();
  const hasBankruptcy = bankruptcyData?.records && bankruptcyData.records.length > 0;

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>My Accounts | Credit Regulator Pro</title>
      </Helmet>
      
      {currentTab === "accounts" && hasBankruptcy && (
        <div className={styles.bankruptcyBanner}>
          <span>You have bankruptcy records on file.</span>
          <Link to="/bankruptcy-tracker" className={styles.bankruptcyLink}>
            View Bankruptcy Info →
          </Link>
        </div>
      )}

      <Tabs value={currentTab} onValueChange={handleTabChange} className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="accounts">Your Accounts</TabsTrigger>
            <TabsTrigger value="problems">Errors We Found</TabsTrigger>
            <TabsTrigger value="reports">Your Files</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="accounts">
          {currentTab === "accounts" && <TradelinesPage />}
        </TabsContent>
        <TabsContent value="problems">
          {currentTab === "problems" && <CreditorValidationsPage />}
        </TabsContent>
        <TabsContent value="reports">
          {currentTab === "reports" && <ReportArtifactsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}