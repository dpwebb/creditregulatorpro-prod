import React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";

import ProfileSettingsPage from "./profile-settings";
import UserManualPage from "./user-manual";
import SupportTicketsPage from "./support-tickets";

import styles from "./my-info.module.css";

export default function MyInfoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "profile";

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>My Info | Credit Regulator Pro</title>
      </Helmet>
      
      <Tabs value={currentTab} onValueChange={handleTabChange} className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="help">How to Use This App</TabsTrigger>
            <TabsTrigger value="support">Support</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          {currentTab === "profile" && <ProfileSettingsPage />}
        </TabsContent>
        <TabsContent value="help">
          {currentTab === "help" && <UserManualPage />}
        </TabsContent>
        <TabsContent value="support">
          {currentTab === "support" && <SupportTicketsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}