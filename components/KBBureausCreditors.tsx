import React from "react";
import { Link } from "react-router-dom";
import { Building2, FileCheck, ShieldCheck, AlertCircle, MessageSquare } from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import styles from "./KBBureausCreditors.module.css";

export const KBBureausCreditors = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        id="bureaus"
        title="Bureaus & Creditors"
        icon={Building2}
      >
        <p>
          Managing the companies that hold your data is a big part of the dispute process. This section covers how to manage Credit Bureaus and Creditors (the companies that report your accounts).
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="managing-bureaus">
            <AccordionTrigger>Credit Bureaus</AccordionTrigger>
            <AccordionContent>
              <p>
                In Canada, the two main bureaus are Equifax Canada and TransUnion Canada.
              </p>
              <ul>
                <li>
                  <strong>Equifax:</strong> Requires specific forms for dispute escalation.
                </li>
                <li>
                  <strong>TransUnion:</strong> Often accepts digital disputes but has strict identity rules.
                </li>
              </ul>
              <p>
                You can add or update bureau details in the{" "}
                <Link to="/bureaus">Bureaus Dashboard</Link>.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="bureau-addresses">
            <AccordionTrigger>Bureau Contact Addresses</AccordionTrigger>
            <AccordionContent>
              <p>
                Credit Regulator Pro saves the correct mailing addresses for each bureau:
              </p>
              <div className={styles.addressBox}>
                <h4>Equifax Canada – Regular &amp; Registered Mail</h4>
                <p>National Consumer Relations</p>
                <p>Box 190</p>
                <p>Montreal, Quebec H1S 2Z2</p>
              </div>
              <div className={styles.addressBox}>
                <h4>TransUnion Canada – Regular Mail</h4>
                <p>Consumer Relations Department</p>
                <p>P.O. Box 338, LCD1</p>
                <p>Hamilton, Ontario L8L 7W2</p>
              </div>
              <div className={styles.addressBox}>
                <h4>TransUnion Canada – Registered Mail</h4>
                <p>Consumer Relations Centre</p>
                <p>3115 Harvester Road, Suite 201</p>
                <p>Burlington, Ontario L7N 3N8</p>
              </div>
              <p className={styles.note}>
                These addresses are added automatically to your letters. Use the Registered Mail address when sending via Canada Post Registered Mail.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="creditor-management">
            <AccordionTrigger>Creditor Management</AccordionTrigger>
            <AccordionContent>
              <p>
                Creditors are the companies that give data to the bureaus (like banks, cell phone companies, or collection agencies).
              </p>
              <p>
                When you upload a credit report, we find these companies automatically. You may need to add their mailing addresses yourself if you want to send them a letter directly.
              </p>
              <div className={styles.tip}>
                <Badge variant="info">TIP</Badge>
                <p>
                  Always make sure you have the correct "Dispute Address" for a creditor. Sending a letter to their payment address often slows things down.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="creditor-validation"
        title="Checking the Companies"
        icon={ShieldCheck}
        badge="PROCEDURAL ENGINE"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro includes a system that powers the dispute engine.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="trigger-analysis">
            <AccordionTrigger>Finding the Best Strategy</AccordionTrigger>
            <AccordionContent>
              <p>
                The system looks at the errors on the account and picks the best reason to challenge it.
              </p>
              <p>
                It chooses the most urgent problem. For example, if dates are wrong, it questions their accuracy. If the account is new, it asks why they looked at your file. Each suggestion tells you exactly why that strategy is best.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="vector-selection">
            <AccordionTrigger>Moving to the Next Step</AccordionTrigger>
            <AccordionContent>
              <p>
                The system figures out what to do next based on what the company replied. It makes sure you do not skip steps.
              </p>
              <h4>How It Works:</h4>
              <ol className={styles.list}>
                <li>Check what step you are on now.</li>
                <li>If the step is done, move to the next one.</li>
                <li>If all 4 steps are done, mark the challenge as finished.</li>
              </ol>
              <p>
                This ensures you use every legal option without skipping steps.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="deadline-calculation">
            <AccordionTrigger>Tracking Deadlines</AccordionTrigger>
            <AccordionContent>
              <p>
                Calculates the legal deadline for them to reply based on your province.
              </p>
              <ul>
                <li>The deadline depends on what kind of challenge you send.</li>
                <li>It also depends on local laws.</li>
                <li>Most challenges give them 30 days to reply.</li>
              </ul>
              <p>
                This date is saved to your calendar so you know exactly when to follow up.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="deficiency-detection">
            <AccordionTrigger>How We Check Their Response</AccordionTrigger>
            <AccordionContent>
              <p>
                Reads what the company sends back to see if they left anything out.
              </p>
              <h4>Things We Look For:</h4>
              <div className={styles.patternGrid}>
                <div className={styles.patternCard}>
                  <h4>Generic Verification</h4>
                  <ul>
                    <li>"verified as accurate"</li>
                    <li>"account information matches"</li>
                  </ul>
                  <p className={styles.deficiency}>
                    <strong>Problem:</strong> They gave a generic answer without any proof.
                  </p>
                </div>

                <div className={styles.patternCard}>
                  <h4>Dismissive Language</h4>
                  <ul>
                    <li>"frivolous"</li>
                    <li>"irrelevant"</li>
                  </ul>
                  <p className={styles.deficiency}>
                    <strong>Problem:</strong> They ignored your legal request.
                  </p>
                </div>

                <div className={styles.patternCard}>
                  <h4>Missing Proof</h4>
                  <ul>
                    <li>"unable to provide"</li>
                    <li>"policy prohibits"</li>
                  </ul>
                  <p className={styles.deficiency}>
                    <strong>Problem:</strong> They refused to show the proof you asked for.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="response-quality"
        title="Checking Reply Quality"
        icon={MessageSquare}
        badge="AUTOMATED"
      >
        <p>
          Credit Regulator Pro automatically checks all replies to see if they are helpful or legally complete.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="quality-scoring">
            <AccordionTrigger>Quality Scoring</AccordionTrigger>
            <AccordionContent>
              <p>
                Each reply is scored on:
              </p>
              <ul>
                <li><strong>Did they answer the question?</strong> Did they address your specific challenge?</li>
                <li><strong>Did they give proof?</strong> Did they include the documents you asked for?</li>
                <li><strong>Did they reply on time?</strong> Was the letter received before the legal deadline?</li>
              </ul>
              <p>
                If the reply scores poorly, the system will suggest moving to the next step in the dispute process.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="metro2"
        title="Format Compliance"
        icon={FileCheck}
        badge="Technical"
      >
        <p>
          Credit reports use a specific format. Credit Regulator Pro checks if your data follows this format to find errors you can challenge.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="validation-rules">
            <AccordionTrigger>Format Rules</AccordionTrigger>
            <AccordionContent>
              <p>
                The system checks many rules. You can see them in the{" "}
                <Link to="/metro2-compliance">Metro2 Compliance</Link> section.
              </p>
              <h3>Common Errors:</h3>
              <ul>
                <li>
                  <strong>Missing Codes:</strong> Missing co-borrower data when an account is shared.
                </li>
                <li>
                  <strong>Wrong Status:</strong> Statuses that do not match the payment history.
                </li>
                <li>
                  <strong>Date Errors:</strong> Being late after the account is already closed.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="severity-levels">
            <AccordionTrigger>Error Seriousness</AccordionTrigger>
            <AccordionContent>
              <div className={styles.severityList}>
                <div className={styles.severityItem}>
                  <Badge variant="error">ERROR</Badge>
                  <p>
                    A critical error. The data is impossible or breaks a major rule. This is a very strong reason for deletion.
                  </p>
                </div>
                <div className={styles.severityItem}>
                  <Badge variant="warning">WARNING</Badge>
                  <p>
                    The data is likely incorrect or suspicious. Good for challenging accuracy.
                  </p>
                </div>
                <div className={styles.severityItem}>
                  <Badge variant="info">INFO</Badge>
                  <p>
                    Something to note. Useful for showing they are not paying attention.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};