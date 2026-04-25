import React from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Button } from "./Button";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { Headset, MessageSquare, Reply, HelpCircle, ShieldAlert, Lock } from "lucide-react";
import styles from "./KBSupportGuide.module.css";

export const KBSupportGuide = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Welcome, Support Agent"
        icon={Headset}
        badge="SUPPORT ROLE"
        badgeVariant="primary"
      >
        <p>
          As a support agent, your main job is to help users with their questions and problems. 
          You manage the support ticket queue and have special access to help resolve issues quickly.
        </p>
        <ul className={styles.list}>
          <li>You bypass subscription checks and terms acceptance pages.</li>
          <li>You can view all user tickets and reply to them.</li>
          <li>You cannot change system settings, manage other users, or view global analytics.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Managing the Ticket Queue"
        icon={MessageSquare}
        badge="CORE TASK"
        badgeVariant="success"
      >
        <p>
          The Support Tickets page is your main workspace. Here you can see all questions from users.
        </p>
        <ul className={styles.list}>
          <li><strong>View Tickets:</strong> See a list of all open and closed tickets.</li>
          <li><strong>Filter:</strong> Sort tickets by their current status or priority.</li>
          <li><strong>Assign:</strong> Assign a ticket to yourself or another agent so everyone knows who is working on it.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/support-tickets">Go to Support Tickets</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Replying to Users"
        icon={Reply}
      >
        <p>
          When you open a ticket, you can chat with the user and update the ticket details.
        </p>
        <ul className={styles.list}>
          <li><strong>Add Replies:</strong> Type your message and send it. Keep your words simple and clear. Avoid confusing technical terms.</li>
          <li><strong>Update Status:</strong> Change the ticket to Open, In Progress, Resolved, or Closed based on what is happening.</li>
          <li><strong>Change Priority:</strong> Set the ticket to Low, Medium, High, or Urgent if the issue needs faster attention.</li>
        </ul>
        <p><em>Tip: Always make sure you understand the user's exact problem before you reply.</em></p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Common User Issues"
        icon={HelpCircle}
        badge="QUICK REFERENCE"
        badgeVariant="info"
      >
        <p>
          Here are some frequent problems users face and how you can guide them.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="issue-1">
            <AccordionTrigger>User can't upload a report</AccordionTrigger>
            <AccordionContent>
              Check if the file is in PDF format. The system only accepts PDFs. 
              Also, check if the file is too large or if they have hit the rate limit (5 uploads per hour).
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="issue-2">
            <AccordionTrigger>User locked out after trial</AccordionTrigger>
            <AccordionContent>
              Their 7-day free trial has ended. They need to subscribe to a monthly or annual plan. 
              Direct them to the Account & Billing page to update their payment details.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="issue-3">
            <AccordionTrigger>Packets not generating</AccordionTrigger>
            <AccordionContent>
              To create dispute letters, the user's profile must be complete. 
              Tell them to go to Profile Settings and enter their full legal name and a valid Canadian address.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="issue-4">
            <AccordionTrigger>User sees 'rate limit' error</AccordionTrigger>
            <AccordionContent>
              They have done too many actions too quickly. Explain that the system has safety limits. 
              Tell them to wait an hour and try again.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="issue-5">
            <AccordionTrigger>User wants to start over</AccordionTrigger>
            <AccordionContent>
              If a user wants to delete all their reports and data to start fresh, you cannot do this for them. 
              Only an admin can reset user data. Escalate the ticket to an admin.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="What You Cannot Do"
        icon={ShieldAlert}
        badge="LIMITS"
        badgeVariant="error"
      >
        <p>
          There are certain actions restricted to admins only. If a user needs these, you must assign the ticket to an admin.
        </p>
        <ul className={styles.list}>
          <li>You cannot reset a user's data.</li>
          <li>You cannot change system compliance rules or thresholds.</li>
          <li>You cannot access admin settings or analytics dashboards.</li>
          <li>You cannot create accounts for other support agents.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Content Protection Note"
        icon={Lock}
      >
        <p>
          As a support agent, you can easily copy text and right-click anywhere in the app. 
          However, regular users have restrictions. They cannot copy text or right-click on proprietary content 
          like dispute letters.
        </p>
        <p>
          <strong>This is normal and expected.</strong> If a user complains that they cannot copy text, 
          do not treat it as a bug. Explain that the system protects certain documents.
        </p>
      </KnowledgeBaseSection>
    </div>
  );
};