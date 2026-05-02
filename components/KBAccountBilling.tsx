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
import { UserCircle, CreditCard, Calendar, Mail, Key, MessageSquare } from "lucide-react";
import styles from "./KBAccountBilling.module.css";

export const KBAccountBilling = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Roles & Subscriptions"
        icon={CreditCard}
        badge="BILLING"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro supports three user roles and offers structured subscription plans
          tailored for individual consumers.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="roles">
            <AccordionTrigger>User Roles</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>User:</strong> Standard consumer account with full access to their own dispute operations, uploads, and tracking.</li>
                <li><strong>Admin:</strong> Internal staff accounts with access to system-wide analytics, rules engine configuration, and user management.</li>
                <li><strong>Support:</strong> CS agents who handle support tickets, reply to users, and assist with account issues without being restricted by subscription statuses.</li>
              </ul>
              <p className={styles.note}>Note: The 'Enterprise' role has been officially removed from the system.</p>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="plans">
            <AccordionTrigger>Subscription Plans</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Trial User (7 Days):</strong> Free trial plan with full access for 7 days. You can upgrade anytime to monthly or annual.</li>
                <li><strong>Monthly:</strong> $19.95 CAD / month. Ideal for short-term dispute management.</li>
                <li><strong>Annual:</strong> $49.95 CAD / year. Best value for ongoing credit monitoring and maintenance.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Trial User"
        icon={Calendar}
        badge="IMPORTANT"
        badgeVariant="success"
      >
        <p>
          We offer flexible onboarding through the Trial User period.
        </p>
        <ul className={styles.list}>
          <li><strong>Trial Users:</strong> All new registrations begin with a 7-day free trial. You receive full feature access completely free to generate packets and run scans. Upgrade anytime to keep using all features.</li>
          <li><strong>Account Lockout:</strong> After a trial expires, you must subscribe to an active monthly or annual plan. If you fail to subscribe, your account access will be locked until payment is resolved.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Profile Requirements for Dispute Packets"
        icon={UserCircle}
        badge="MANDATORY"
        badgeVariant="error"
      >
        <p>
          In order to legally interact with credit bureaus and creditors, your profile must 
          be strictly completed.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="requirements">
            <AccordionTrigger>Required Information</AccordionTrigger>
            <AccordionContent>
              <p>
                The system will block the generation of dispute packets until your profile contains:
              </p>
              <ul className={styles.list}>
                <li><strong>Full Legal Name:</strong> Must match your government-issued ID exactly.</li>
                <li><strong>Canadian Address:</strong> Must be a valid address within Canada. Non-Canadian postal codes will be rejected by the system.</li>
              </ul>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/my-info?tab=profile">Complete Profile Settings</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Authentication & Security"
        icon={Key}
      >
        <p>
          Accessing your Credit Regulator Pro account is secured through multiple layers.
        </p>
        <ul className={styles.list}>
          <li><strong>Email Verification:</strong> New registrations require email verification before gaining full platform access.</li>
          <li><strong>Password Management:</strong> Passwords can be updated securely from your profile. Reset links are sent via email if you forget your credentials.</li>
          <li><strong>OAuth Logins:</strong> Credit Regulator Pro supports Google OAuth via the Floot framework for streamlined, one-click authentication.</li>
        </ul>
        <div className={styles.actionRow}>
          <Button asChild variant="outline" size="sm" className={styles.actionButton}>
            <Link to="/login">Login Page</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={styles.actionButton}>
            <Link to="/register">Create Account</Link>
          </Button>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Support Tickets"
        icon={MessageSquare}
        badge="HELP"
        badgeVariant="info"
      >
        <p>
          Need help? You can submit and manage support tickets directly from your dashboard.
          Our support agents are available to assist with any billing, technical, or procedural issues.
        </p>
        <ul className={styles.list}>
          <li><strong>Submit Tickets:</strong> Create new tickets describing your issue in detail.</li>
          <li><strong>Track Status:</strong> View the current status of your open tickets.</li>
          <li><strong>Reply & Communicate:</strong> Add replies to ongoing conversations with our support team.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/my-info?tab=support">Manage Support Tickets</Link>
        </Button>
      </KnowledgeBaseSection>
    </div>
  );
};
