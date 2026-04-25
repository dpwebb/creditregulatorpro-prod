import React from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { Users, RotateCcw, Headset, Search } from "lucide-react";
import styles from "./KBAdminUsers.module.css";

export const KBAdminUsers = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Viewing Users"
        icon={Search}
        badge="USER LIST"
        badgeVariant="primary"
      >
        <p>
          The User Management page shows everyone who signed up for the app. 
          You can quickly find a specific person or see a group of users.
        </p>
        <ul className={styles.list}>
          <li><strong>Search:</strong> Type a name or email in the search bar. The list will update as you type.</li>
          <li><strong>Filter by Role:</strong> Use the dropdown menu to show only admins, support agents, or regular users.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-user-management">Go to User Management</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="User Stats"
        icon={Users}
      >
        <p>
          Each user card shows helpful numbers. These stats tell you how much the user is doing in the app.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="stats">
            <AccordionTrigger>What the numbers mean</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Tradelines:</strong> How many credit accounts they have loaded.</li>
                <li><strong>Packets:</strong> How many dispute letters they have made.</li>
                <li><strong>Evidence:</strong> How many files and actions they have saved in the system.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Resetting User Data"
        icon={RotateCcw}
        badge="DANGER"
        badgeVariant="error"
      >
        <p>
          Sometimes a user wants to start over. You can reset their data for them. 
          This deletes their reports, tradelines, packets, and evidence. 
          It does not delete their account or profile details.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="reset">
            <AccordionTrigger>How to reset data</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.list}>
                <li>Find the user in the list.</li>
                <li>Click the three dots next to their stats.</li>
                <li>Click <strong>Reset User Data</strong>.</li>
                <li>A warning box will appear. Read it carefully.</li>
                <li>Type the user's email to confirm you want to do this.</li>
                <li>Click <strong>Reset</strong>.</li>
              </ol>
              <p>This action cannot be undone. Always be sure before you reset.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Support Agents"
        icon={Headset}
        badge="TEAM"
        badgeVariant="info"
      >
        <p>
          Support agents help users with their questions. Only admins can create support agent accounts.
        </p>
        <ul className={styles.list}>
          <li>Click the <strong>Add Support Agent</strong> button at the top of the page.</li>
          <li>Enter an email, a display name, and a temporary password.</li>
          <li>Click <strong>Create Agent</strong>.</li>
          <li>Give the new agent their email and temporary password so they can log in.</li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};