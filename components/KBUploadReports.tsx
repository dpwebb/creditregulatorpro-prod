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
import { Upload, ScanSearch, CheckSquare, History, FileText, RefreshCw, Globe, Sparkles } from "lucide-react";
import styles from "./KBUploadReports.module.css";

export const KBUploadReports = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="How to Get Your Free Credit Report"
        icon={Globe}
      >
        <p>
          Before you can use Credit Regulator Pro, you'll need to obtain a copy of your credit report. TransUnion Canada provides a free "Consumer Disclosure" report that you can easily download and use here.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="online">
            <AccordionTrigger>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                Online
                <Badge variant="success">RECOMMENDED — INSTANT</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ol className={styles.list} style={{ listStyleType: "decimal" }}>
                <li><strong>Visit TransUnion:</strong> Go to the secure OCS portal.</li>
                <li><strong>Enter your info:</strong> Provide your full name, date of birth, current address, and previous address if you moved in the last 2 years (SIN is optional).</li>
                <li><strong>Verify identity:</strong> Answer a few multiple-choice security questions about your credit history.</li>
                <li><strong>Download PDF:</strong> Save the Consumer Disclosure report as a PDF to your computer.</li>
                <li><strong>Upload:</strong> Come back to this page and upload the PDF file!</li>
              </ol>
              <Button asChild className={styles.actionButton}>
                <a href="https://ocs.transunion.ca/secureocs/#/consumer-disclosure/faq" target="_blank" rel="noopener noreferrer">
                  Get Report from TransUnion
                </a>
              </Button>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="mail">
            <AccordionTrigger>By Mail (5–10 business days)</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.list} style={{ listStyleType: "decimal" }}>
                <li><strong>Download Form:</strong> Get the Consumer Request form from the TransUnion Canada website.</li>
                <li><strong>Fill it out:</strong> Complete all required personal information.</li>
                <li><strong>Attach IDs:</strong> Include photocopies of two pieces of acceptable identification (see Accepted IDs below). Do not send originals.</li>
                <li><strong>Mail it:</strong> Send the form and IDs to:<br />
                  TransUnion Consumer Relations Department<br />
                  P.O. Box 338, LCD1<br />
                  Hamilton, Ontario L8L 7W2
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="phone">
            <AccordionTrigger>By Phone</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li>Call TransUnion Canada toll-free at <strong>1-800-663-9980</strong>.</li>
                <li>You will be asked verification questions over the phone.</li>
                <li>Your report will be mailed to your home address.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="in-person">
            <AccordionTrigger>In Person</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li>Visit a TransUnion provincial office.</li>
                <li>Bring two pieces of acceptable identification with you.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="accepted-ids">
            <AccordionTrigger>Accepted ID Documents</AccordionTrigger>
            <AccordionContent>
              <p style={{ marginBottom: "0.5rem" }}>If requesting by mail or in person, you need two pieces of non-expired identification.</p>
              <p style={{ marginBottom: "0.25rem", fontWeight: 600 }}>Primary ID (Choose 1):</p>
              <ul className={styles.list}>
                <li>Driver's Licence</li>
                <li>Canadian Passport</li>
                <li>Certificate of Indian Status</li>
                <li>Birth Certificate</li>
                <li>Permanent Resident Card</li>
                <li>Citizenship Card</li>
                <li>Old Age Security Card</li>
                <li>Provincial Photo ID</li>
              </ul>
              <p style={{ marginBottom: "0.25rem", fontWeight: 600 }}>Secondary ID (Choose 1):</p>
              <ul className={styles.list}>
                <li>Utility bill with current address</li>
                <li>SIN Card</li>
                <li>T4 slip (current year)</li>
                <li>CRA Notice of Assessment</li>
                <li>GST/HST Refund notice</li>
                <li>Child Tax Benefit statement</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Try Before You Sign Up"
        icon={Sparkles}
        badge="FREE PREVIEW"
        badgeVariant="info"
      >
        <p>
          You can try our system before creating an account. Upload a credit report to see what errors the scanner finds.
        </p>
        <ul className={styles.list}>
          <li>The preview shows the violations we detected and a summary of your credit accounts.</li>
          <li>To save your results, take action, or create dispute letters, you will need to create a free account.</li>
          <li>You can upload up to 5 times every 22 minutes to prevent spam.</li>
        </ul>
        <Button asChild className={styles.actionButton}>
          <Link to="/try-upload">Try Uploading a Report</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Report Upload & Processing Pipeline"
        icon={Upload}
        badge="CORE WORKFLOW"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro employs a sophisticated multi-stage pipeline for ingesting credit reports,
          ensuring high-fidelity data extraction and immediate compliance scanning.
        </p>
        <div className={styles.processBox}>
          <h3>The Complete Flow</h3>
          <ol className={styles.list}>
            <li><strong>Upload PDF:</strong> Provide your Canadian Equifax or TransUnion credit report.</li>
            <li><strong>OCR Extraction:</strong> Advanced AI extracts text into structured data.</li>
            <li><strong>Review Parsed Data:</strong> Human-in-the-loop validation of extracted fields.</li>
            <li><strong>Approve & Finalize:</strong> Tradelines are generated in the database.</li>
            <li><strong>Compliance Scan:</strong> The 35-module compliance scanner auto-runs.</li>
          </ol>
          <Button asChild className={styles.actionButton}>
            <Link to="/upload">Upload a Report</Link>
          </Button>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="OCR Data Extraction Process"
        icon={ScanSearch}
        badge="AI POWERED"
        badgeVariant="success"
      >
        <p>
          We utilize state-of-the-art Gemini OCR technology to reliably parse complex 
          PDF and HTML credit reports. The system automatically detects the bureau 
          (Equifax vs. TransUnion) and routes it to the appropriate parser.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="extracted-data">
            <AccordionTrigger>What Gets Extracted?</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Consumer Info:</strong> Names, AKAs, addresses, DOB, and employment.</li>
                <li><strong>Tradelines:</strong> Account numbers, balances, limits, statuses, and payment histories.</li>
                <li><strong>Public Records:</strong> Bankruptcies, judgments, and liens.</li>
                <li><strong>Inquiries:</strong> Hard and soft pulls with their respective dates.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="accuracy">
            <AccordionTrigger>Handling OCR Errors</AccordionTrigger>
            <AccordionContent>
              <p>
                While highly accurate, OCR can occasionally misinterpret distorted text. 
                The system flags low-confidence extractions and relies on the subsequent 
                <strong> Upload Review</strong> phase to ensure perfect data integrity.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Reviewing & Approving Parsed Data"
        icon={CheckSquare}
        badge="ACTION REQUIRED"
        badgeVariant="warning"
      >
        <p>
          After extraction, the report enters the <strong>Upload Review</strong> phase. 
          This human-in-the-loop step is critical for maintaining legally accurate records.
        </p>
        <ul className={styles.list}>
          <li><strong>Field-by-Field Approval:</strong> Review the extracted data side-by-side with the source document.</li>
          <li><strong>Correcting Errors:</strong> Manually fix any parsing inaccuracies before they enter the database.</li>
          <li><strong>Tradeline Creation:</strong> Once approved, the data is formally instantiated as Tradeline entities.</li>
          <li><strong>Upload Results:</strong> View a summary of created tradelines and automatically detected compliance infractions.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Change Detection & Drift"
        icon={RefreshCw}
        badge="ANALYTICS"
        badgeVariant="info"
      >
        <p>
          Uploading successive credit reports over time unlocks Credit Regulator Pro's powerful 
          Change Detection engine. 
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="drift-detection">
            <AccordionTrigger>How Drift Detection Works</AccordionTrigger>
            <AccordionContent>
              <p>
                When a new report is uploaded, the system compares the new snapshot against 
                historical data for the same tradelines. It logs "drift" events for any changes in:
              </p>
              <ul className={styles.list}>
                <li>Balance inflation or unexpected adjustments.</li>
                <li>Changes to the Date of First Delinquency (DOFD).</li>
                <li>Status alterations (e.g., from "Charge-off" to "Collection").</li>
                <li>Removed or re-inserted accounts.</li>
              </ul>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/change-detection">View Change Detection Dashboard</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Report Artifact Management"
        icon={History}
      >
        <p>
          Original credit reports are stored securely as <strong>Report Artifacts</strong> 
          for a maximum of 1 year, ensuring compliance with our retention policies.
        </p>
        <ul className={styles.list}>
          <li>Access the original PDF/HTML files at any time during the retention period.</li>
          <li>View the raw source text extracted from the report.</li>
          <li>Manage links between artifacts and their corresponding tradelines.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/report-artifacts">Manage Report Artifacts</Link>
        </Button>
      </KnowledgeBaseSection>
    </div>
  );
};