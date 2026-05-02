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
import { Mail, MapPin, ShieldAlert, FileCheck, Globe, Truck } from "lucide-react";
import styles from "./KBPackets.module.css";

export const KBPackets = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Dispute Packets"
        icon={Mail}
        badge="AUTOMATED"
        badgeVariant="success"
      >
        <p>
          A <strong>Packet</strong> is a generated PDF document containing your formal dispute
          letter, supporting evidence, and identity verification.
        </p>
        <p>
          Credit Regulator Pro automates the creation of these packets, ensuring they cite the correct
          provincial statutes based on your residence.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="All 13 Canadian Provinces & Territories"
        icon={Globe}
        badge="COMPLETE COVERAGE"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro provides dispute letter templates for all Canadian jurisdictions with
          proper statutory citations:
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="provinces">
            <AccordionTrigger>Complete Jurisdiction List</AccordionTrigger>
            <AccordionContent>
              <div className={styles.jurisdictionGrid}>
                <div className={styles.jurisdictionCard}>
                  <h4>Ontario</h4>
                  <p>Consumer Reporting Act</p>
                  <code>R.S.O. 1990, c. C.33</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Nova Scotia</h4>
                  <p>Consumer Reporting Act</p>
                  <code>S.N.S. 2010, c. 13</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Quebec</h4>
                  <p>Credit Agents Act (Bilingual)</p>
                  <code>RLRQ c. A-8.2</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Alberta</h4>
                  <p>Personal Information Protection Act</p>
                  <code>S.A. 2003, c. P-6.5</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>British Columbia</h4>
                  <p>Consumer Reporting Act</p>
                  <code>R.S.B.C. 1996, c. 69</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Manitoba</h4>
                  <p>Consumer Protection Act</p>
                  <code>C.C.S.M. c. C200</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Saskatchewan</h4>
                  <p>Consumer Protection and Business Practices Act</p>
                  <code>S.S. 2014, c. C-30.2</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>New Brunswick</h4>
                  <p>Consumer Reporting Act</p>
                  <code>S.N.B. 2009, c. C-24.3</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Prince Edward Island</h4>
                  <p>Consumer Reporting Act</p>
                  <code>R.S.P.E.I. 1988, c. C-26</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Newfoundland & Labrador</h4>
                  <p>Consumer Protection and Business Practices Act</p>
                  <code>S.N.L. 2009, c. C-31.1</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Yukon</h4>
                  <p>Consumer Protection Act</p>
                  <code>R.S.Y. 2002, c. 40</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Northwest Territories</h4>
                  <p>Consumer Protection Act</p>
                  <code>S.N.W.T. 2007, c. 11</code>
                </div>

                <div className={styles.jurisdictionCard}>
                  <h4>Nunavut</h4>
                  <p>Consumer Protection Act</p>
                  <code>R.S.N.W.T. (Nu) 1988, c. C-17</code>
                </div>
              </div>
              <p className={styles.note}>
                Quebec templates are provided in French with proper legal formatting per
                Quebec civil law requirements.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="statutes">
            <AccordionTrigger>Automatic Statute Selection</AccordionTrigger>
            <AccordionContent>
              <p>
                The system automatically detects your province from your profile address and
                inserts the relevant consumer protection laws.
              </p>
              <p>
                Each template includes:
              </p>
              <ul className={styles.list}>
                <li>Complete statutory citations with section numbers</li>
                <li>Consumer statement rights under provincial law</li>
                <li>Specific statutory timeframes (typically 30 days)</li>
                <li>Required notice language per jurisdiction</li>
                <li>Links to official statute sources</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Tracking & Delivery System"
        icon={MapPin}
        badge="PROOF OF DELIVERY"
      >
        <p>
          Credit Regulator Pro includes a comprehensive tracking placeholder system for registered/certified mail:
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="tracking">
            <AccordionTrigger>Tracking Placeholders</AccordionTrigger>
            <AccordionContent>
              <p>
                Every generated packet includes a tracking number placeholder field. When you
                mail the packet via registered or certified mail, enter the tracking number to:
              </p>
              <ul className={styles.list}>
                <li>Create auditable proof of mailing date</li>
                <li>Track delivery confirmation</li>
                <li>Calculate statutory response deadlines</li>
                <li>Document procedural compliance</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="delivery-instructions">
            <AccordionTrigger>Province-Specific Delivery Instructions</AccordionTrigger>
            <AccordionContent>
              <p>
                The system provides jurisdiction-specific guidance:
              </p>
              <ul className={styles.list}>
                <li>
                  <strong>Most Provinces:</strong> Canada Post Certified Mail with signature
                  confirmation
                </li>
                <li>
                  <strong>Quebec:</strong> Registered Mail (recommended for legal proceedings)
                </li>
                <li>
                  <strong>Remote Territories:</strong> Special delivery considerations for
                  Yukon, NWT, and Nunavut
                </li>
              </ul>
              <p>
                Each packet includes printed delivery instructions with warning text about
                the importance of tracking numbers.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Terminal Label Progression"
        icon={ShieldAlert}
        badge="POLICY"
        badgeVariant="error"
      >
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="terminal">
            <AccordionTrigger>Terminal Label Progression</AccordionTrigger>
            <AccordionContent>
              <p>
                Canadian dispute proceedings follow a strict 4-phase progression. The label changes as you
                escalate through different challenge strategies.
              </p>
              
              <div className={styles.progressionContainer}>
                <div className={styles.phaseItem}>
                  <div className={styles.phaseHeader}>
                    <Badge variant="default">PHASE 1</Badge>
                    <strong>Foundational Challenge</strong>
                  </div>
                  <div className={styles.phaseLabel}>PHASE 1: FOUNDATIONAL CHALLENGE — PENDING</div>
                  <p>Initial challenge regarding authority to report and permissible purpose.</p>
                </div>

                <div className={styles.phaseConnector}>↓</div>

                <div className={styles.phaseItem}>
                  <div className={styles.phaseHeader}>
                    <Badge variant="default">PHASE 2</Badge>
                    <strong>Methodological Challenge</strong>
                  </div>
                  <div className={styles.phaseLabel}>PHASE 2: METHODOLOGICAL CHALLENGE — PENDING</div>
                  <p>Challenge regarding verification methods and completeness of data.</p>
                </div>

                <div className={styles.phaseConnector}>↓</div>

                <div className={styles.phaseItem}>
                  <div className={styles.phaseHeader}>
                    <Badge variant="default">PHASE 3</Badge>
                    <strong>Substantive Challenge</strong>
                  </div>
                  <div className={styles.phaseLabel}>PHASE 3: SUBSTANTIVE CHALLENGE — PENDING</div>
                  <p>Challenge regarding accuracy attestation and investigation procedures.</p>
                </div>

                <div className={styles.phaseConnector}>↓</div>

                <div className={styles.phaseItem}>
                  <div className={styles.phaseHeader}>
                    <Badge variant="default">PHASE 4</Badge>
                    <strong>Procedural Exhaustion</strong>
                  </div>
                  <div className={styles.phaseLabel}>PHASE 4: PROCEDURAL EXHAUSTION — PENDING</div>
                  <p>Final procedural challenge regarding timing compliance.</p>
                </div>

              </div>

              <p className={styles.note}>
                <strong>Important:</strong> You cannot jump to the final phase immediately.
                The system requires progression through the phases unless specific criteria are met.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Generation Process"
        icon={FileCheck}
      >
        <Accordion type="single" collapsible>
          <AccordionItem value="steps">
            <AccordionTrigger>Step-by-Step Generation</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.list}>
                <li>Go to a <strong>Tradeline</strong> detail page.</li>
                <li>Click <strong>"Preview Packet"</strong>.</li>
                <li>Select the dispute vector (e.g., "AUTHORITY_TO_REPORT", "VERIFICATION_METHOD").</li>
                <li>The system generates a draft PDF using your province's template. Review it carefully.</li>
                <li>Click <strong>"Sign & Generate"</strong> to finalize. This creates an immutable record with hash chain linking.</li>
                <li>Enter tracking number after mailing to complete the evidence chain.</li>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Sending Your Letter"
        icon={Truck}
      >
        <p>
          After you generate your dispute packet, you need to send it to the credit bureau. We offer two ways to do this through the Delivery Wizard.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="mail-us">
            <AccordionTrigger>Mail It Through Us</AccordionTrigger>
            <AccordionContent>
              <p>
                We can print and mail your approved letter for you using Canada Post registered mail via PostGrid. This is only a mailing service at your direction. We do not represent you or speak for you.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="mail-yourself">
            <AccordionTrigger>Mail It Yourself</AccordionTrigger>
            <AccordionContent>
              <p>
                You can print the PDF and mail it yourself using registered mail. Afterward, come back to the app and enter your tracking number. The system will start tracking your response deadline from the date you enter it.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <p className={styles.note}>
          Both methods create an official record in the system to track when the bureau must reply.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Delivery & Response Management"
        icon={MapPin}
      >
        <p>
          Once generated, you must print and mail the packet via registered/certified mail.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Tracking Number:</strong> Always enter the registered mail tracking number
            into the packet record in Credit Regulator Pro.
          </li>
          <li>
            <strong>Response Management:</strong> When a bureau responds, log the response date
            immediately. This stops the "Response Clock" and calculates if they met the statutory
            deadline (usually 30 days).
          </li>
          <li>
            <strong>Upload Response:</strong> Use the Bureau Communication Upload feature to link
            the physical response to the packet.
          </li>
        </ul>
        <Button asChild variant="default" size="sm" className={styles.actionButton}>
          <Link to="/packets">Manage Packets</Link>
        </Button>
      </KnowledgeBaseSection>
    </div>
  );
};
