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
import { CreditCard, Database, FileText, AlertCircle, ScanSearch, TrendingUp } from "lucide-react";
import styles from "./KBTradelines.module.css";

export const KBTradelines = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Understanding Tradelines"
        icon={CreditCard}
      >
        <p>
          A <strong>Tradeline</strong> is a credit account on your report, like a credit card or loan. Tradelines are the main items we check during the dispute process.
        </p>
        <p>
          Having correct data helps us make valid dispute letters and find broken rules.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="35 Built-In Checks"
        icon={ScanSearch}
        badge="AUTO-DETECTION"
        badgeVariant="primary"
      >
        <p>
          Every account is automatically checked using our 35 built-in checks when you add or change it.
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="scan-process">
            <AccordionTrigger>How We Check</AccordionTrigger>
            <AccordionContent>
              <p>
                The scanner runs automatically and:
              </p>
              <ol className={styles.list}>
                <li>Checks account data against 35 rules.</li>
                <li>Compares new reports with old ones to find hidden changes.</li>
                <li>Makes sure the format follows reporting rules.</li>
                <li>Scores how sure we are about each error.</li>
                <li>Gives you simple explanations and tells you what to do.</li>
                <li>Saves the results in your account.</li>
              </ol>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/metro2-compliance">View Scanner Details</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="rescan">
            <AccordionTrigger>Rescan Feature</AccordionTrigger>
            <AccordionContent>
              <p>
                You can manually trigger a check for any account to:
              </p>
              <ul className={styles.list}>
                <li>Find new errors after you upload a newer report.</li>
                <li>Check the account again if the rules change.</li>
                <li>Find dates that were changed secretly.</li>
                <li>Update our scores when you get new proof.</li>
              </ul>
              <p>
                This helps you track how their reporting changes over time.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Format Rules & Checks"
        icon={FileText}
        badge="VERSION-AWARE"
        badgeVariant="info"
      >
        <p>
          Credit Regulator Pro checks if your account data follows the standard reporting rules to find errors.
        </p>
        
        <Accordion type="single" collapsible>
          <AccordionItem value="validation-system">
            <AccordionTrigger>Format Check System</AccordionTrigger>
            <AccordionContent>
              <p>
                The system checks many rules, like:
              </p>
              <ul>
                <li><strong>Required Fields:</strong> Missing statuses, dates, balances, or creditor details.</li>
                <li><strong>Date Math:</strong> The first late date must make sense.</li>
                <li><strong>Balance Math:</strong> You cannot owe more past due than your total balance.</li>
                <li><strong>Status and Balance Match:</strong> Paid or closed accounts must show a zero balance.</li>
                <li><strong>Joint Accounts:</strong> Shared accounts must have the right codes.</li>
                <li><strong>Payment History:</strong> Must match the account status.</li>
              </ul>
              <p>
                We show you exactly what rule was broken, how serious it is, and what the value should be.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="account-number">
            <AccordionTrigger>Account Number Formats</AccordionTrigger>
            <AccordionContent>
              <p>
                Account numbers help identify an account when the bureau reports one. Some reports hide or omit them, so we also use the creditor, account type, dates, balances, and bureau to match accounts.
              </p>
              <p>
                <strong>Note:</strong> If your report only shows a partial number or no number, use exactly what appears on the report and leave it blank when it is not shown.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="status-codes">
            <AccordionTrigger>Status Codes</AccordionTrigger>
            <AccordionContent>
              <p>
                The "Status" field uses standard codes. Common ones are:
              </p>
              <ul className={styles.codeList}>
                <li><code>11</code> - Current account, 0 payments past due</li>
                <li><code>71</code> - Account 30-59 days past due</li>
                <li><code>97</code> - Unpaid balance reported as a loss (Charge-off)</li>
                <li><code>DA</code> - Delete Account (used for removal requests)</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Finding Hidden Changes"
        icon={TrendingUp}
        badge="TEMPORAL ANALYSIS"
      >
        <p>
          Credit Regulator Pro automatically finds changes between your old and new reports, like changed balances or dates.
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="drift-detection">
            <AccordionTrigger>How We Find Changes</AccordionTrigger>
            <AccordionContent>
              <p>
                When you upload multiple credit reports over time, the system:
              </p>
              <ol className={styles.list}>
                <li>Looks at old reports and compares them to the new one.</li>
                <li>Finds changed dates, balances, or payment histories.</li>
                <li>Flags bad changes that break the rules.</li>
                <li>Scores how sure we are about the change.</li>
                <li>Saves a record of the error.</li>
              </ol>
              <div className={styles.driftExample}>
                <h4>Example: Changed Dates</h4>
                <p>
                  If your first late date changes from 2021-01-15 to 2022-03-20 without a good reason, the system flags this as a serious error.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Error Tracker per Account"
        icon={AlertCircle}
        badge="VIOLATION TRACKER"
      >
        <p>
          Each account has an Error Tracker showing all broken rules and what to do.
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="hub-features">
            <AccordionTrigger>Error Tracker Features</AccordionTrigger>
            <AccordionContent>
              <p>
                The Error Tracker displays:
              </p>
              <ul className={styles.list}>
                <li>
                  <strong>Error Summary:</strong> Count of errors by severity (ERROR, WARNING, INFO).
                </li>
                <li>
                  <strong>Suggested Steps:</strong> Best way to challenge the account.
                </li>
                <li>
                  <strong>Scores:</strong> How sure we are (0-100).
                </li>
                <li>
                  <strong>Technical Details:</strong> The raw data for the error.
                </li>
                <li>
                  <strong>Law Broken:</strong> Which local or federal law they broke.
                </li>
                <li>
                  <strong>Action Buttons:</strong> Make a letter, check again, or view history.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Managing Accounts"
        icon={Database}
      >
        <Accordion type="single" collapsible>
          <AccordionItem value="import">
            <AccordionTrigger>Importing from Reports</AccordionTrigger>
            <AccordionContent>
              <p>
                The best way to add accounts is by uploading a digital credit report.
              </p>
              <ol className={styles.list}>
                <li>Navigate to the <strong>Upload</strong> page.</li>
                <li>Select your credit report file.</li>
                <li>The system will read the file and pull out your account details.</li>
                <li>It will automatically check for errors.</li>
                <li>Review the data and errors before saving.</li>
              </ol>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/upload">Go to Upload</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="manual">
            <AccordionTrigger>Creating Manually</AccordionTrigger>
            <AccordionContent>
              <p>
                If you need to, you can add an account by hand.
              </p>
              <p>
                Go to the <strong>Tradelines</strong> page and click "New Tradeline". You will
                need to provide:
              </p>
              <ul className={styles.list}>
                <li><strong>Account Number:</strong> The full or partial number as it appears on the report, if one is shown.</li>
              <li><strong>Bureau:</strong> The credit bureau reporting this item (Equifax, TransUnion).</li>
            <li><strong>Creditor:</strong> The creditor providing information to the bureau.</li>
            <li><strong>Balance:</strong> The current reported balance.</li>
            <li><strong>Status:</strong> The account status (e.g., Open, Closed, Charged-off).</li>
            <li><strong>First Late Date:</strong> Date of First Delinquency (if applicable).</li>
              </ul>
              <p>
                The system will check it for errors automatically after you save.
              </p>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/my-accounts">Manage Accounts</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

        <KnowledgeBaseSection
        title="How We Check Creditors"
        icon={AlertCircle}
        badge="PROCEDURAL"
      >
        <p>
          Every account is linked to a <strong>Creditor</strong> (the company you owe) and
          a <strong>Bureau</strong> (like Equifax).
        </p>
        <p>
          Our system has tools to help you check them:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Figuring Out the Problem:</strong> Finds the best way to challenge the account based on the errors.
          </li>
          <li>
            <strong>Picking the Next Step:</strong> Moves you through our step-by-step challenge plan.
          </li>
          <li>
            <strong>Tracking Deadlines:</strong> Calculates when they must reply based on local laws.
          </li>
          <li>
            <strong>Checking Their Answers:</strong> Looks at what they send back to see if it is a generic or weak answer.
          </li>
        </ul>
        <p>
          If an account shows up on multiple bureaus (like Equifax and TransUnion), you
          should create a separate account entry for each one. This lets you track them separately.
        </p>
      </KnowledgeBaseSection>
    </div>
  );
};
