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
import { FileArchive, History, UploadCloud, Lock, Link as LinkIcon, FileCheck } from "lucide-react";
import styles from "./KBEvidence.module.css";

export const KBEvidence = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="SHA-256 Hash-Chained Evidence Trail"
        icon={LinkIcon}
        badge="CRYPTOGRAPHIC INTEGRITY"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro uses SHA-256 cryptographic hash chaining to create an immutable evidence trail.
          Every evidence event computes a hash linking it to the previous event, making tampering
          mathematically detectable.
        </p>
        
        <div className={styles.hashChainBox}>
          <h3>Hash Chain Formula</h3>
          <code className={styles.formula}>
            newChainHash = SHA256(previousHash + currentFileHash + metadata)
          </code>
          <p>
            Each evidence upload, bureau communication, or packet generation creates a new link
            in the chain. The system stores both the file hash and the chain hash, allowing
            independent verification of both file integrity and chronological sequence.
          </p>
        </div>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="chain-verification">
            <AccordionTrigger>Chain Verification</AccordionTrigger>
            <AccordionContent>
              <p>
                The chain starts with a genesis block (hash: "GENESIS") and each subsequent
                evidence event extends the chain. To verify integrity:
              </p>
              <ol className={styles.list}>
                <li>Retrieve all evidence events in chronological order</li>
                <li>Recompute each hash using previousHash + payload</li>
                <li>Compare computed hash with stored hash</li>
                <li>Any mismatch indicates tampering or data corruption</li>
              </ol>
              <p>
                This provides court-admissible proof that evidence has not been altered since
                the moment of creation.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Evidence Management"
        icon={FileArchive}
        badge="CORE FEATURE"
        badgeVariant="primary"
      >
        <p>
          Evidence is the backbone of any successful dispute. Credit Regulator Pro provides a robust system
          for collecting, organizing, and presenting evidence to support your claims.
        </p>
        <p>
          All evidence is cryptographically hashed and timestamped to ensure integrity.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Bureau Communication Upload"
        icon={UploadCloud}
        badge="NEW FEATURE"
        badgeVariant="success"
      >
        <p>
          Upload responses from bureaus and creditors to automatically link them to the
          appropriate tradeline, packet, or obligation instance.
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="upload-features">
            <AccordionTrigger>Upload Features</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.featureList}>
                <li>
                  <strong>Automatic Hash Chain Linking:</strong> Each upload extends the evidence
                  hash chain with cryptographic verification.
                </li>
                <li>
                  <strong>Required Context Linking:</strong> Must specify associated tradeline,
                  packet, or obligation instance to maintain evidence organization.
                </li>
                <li>
                  <strong>Communication Type Tracking:</strong> Tag communications as Bureau Response,
                  Furnisher Response, Notice, or Other.
                </li>
                <li>
                  <strong>Rate Limiting:</strong> 10 uploads per hour per user to prevent abuse
                  and ensure deliberate evidence curation.
                </li>
                <li>
                  <strong>Metadata Capture:</strong> Automatically records upload timestamp, file size,
                  file type, and user identity.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="types">
            <AccordionTrigger>Supported Evidence Types</AccordionTrigger>
            <AccordionContent>
              <p>You can upload various types of documents to support your case:</p>
              <ul className={styles.list}>
                <li><strong>Credit Reports:</strong> The primary source of truth for errors.</li>
                <li><strong>Bureau Responses:</strong> Official investigation results and responses.</li>
                <li><strong>Creditor Response:</strong> Letters from creditors or collection agencies.</li>
                <li><strong>Identity Documents:</strong> Proof of ID and address (required for packets).</li>
                <li><strong>Payment Records:</strong> Bank statements or receipts proving payment.</li>
                <li><strong>Tracking Confirmations:</strong> Registered mail receipts and delivery confirmations.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="timeline">
            <AccordionTrigger>The Evidence Timeline</AccordionTrigger>
            <AccordionContent>
              <p>
                Every action taken on a tradeline is recorded in the <strong>Evidence Timeline</strong>. This includes:
              </p>
              <ul className={styles.list}>
                <li>Date of first delinquency reporting.</li>
                <li>Dates of dispute packets sent.</li>
                <li>Dates of responses received.</li>
                <li>Changes in reported balance or status.</li>
                <li>Hash chain verification at each step.</li>
              </ul>
              <p>
                This timeline is crucial for proving "Procedural Exhaustion" — showing that you
                have taken every reasonable step to resolve the issue with cryptographic proof
                of chronology.
              </p>
              <Button asChild variant="outline" size="sm" className={styles.actionButton}>
                <Link to="/evidence-events">View Evidence Log</Link>
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Evidence Packaging for Legal Proceedings"
        icon={FileCheck}
        badge="COURT-READY"
        badgeVariant="info"
      >
        <p>
          Credit Regulator Pro can generate comprehensive court-ready PDF evidence packages with:
        </p>

        <Accordion type="single" collapsible>
          <AccordionItem value="package-contents">
            <AccordionTrigger>Package Contents</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.packageList}>
                <li><strong>Cover Page:</strong> Case details and confidentiality notice</li>
                <li><strong>Executive Summary:</strong> Challenge timeline and creditor compliance record</li>
                <li><strong>Chain of Custody:</strong> Complete audit logs with hash verification</li>
                <li><strong>Challenge Documentation:</strong> All packets with statutory references</li>
                <li><strong>Evidence Attachments Index:</strong> File metadata and hash values</li>
                <li><strong>Statutory References:</strong> Full text and version citations</li>
                <li><strong>Appendices:</strong> Glossary, procedural criteria, contact info</li>
              </ol>
              <p className={styles.packageNote}>
                All packages include SHA-256 hash verification tables allowing independent
                validation of evidence integrity.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Audit Logging"
        icon={History}
        badge="COMPLIANCE"
      >
        <p>
          All evidence operations are logged to the audit trail:
        </p>
        <ul className={styles.list}>
          <li><strong>Upload Events:</strong> User, timestamp, file hash, context linkage</li>
          <li><strong>Access Events:</strong> Who viewed or downloaded evidence and when</li>
          <li><strong>Modification Events:</strong> Any metadata changes (file contents are immutable)</li>
          <li><strong>Deletion Events:</strong> Retention policy enforcement and manual deletions</li>
        </ul>
        <p>
          This audit trail provides a complete record of all evidence handling for regulatory
          compliance and legal proceedings.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Retention Policy"
        icon={Lock}
        badge="IMPORTANT"
        badgeVariant="error"
      >
        <p>
          To comply with Canadian privacy laws and minimize data liability, Credit Regulator Pro enforces
          a strict retention policy.
        </p>
        <div className={styles.policyBox}>
          <h3>1-Year Hard Retention Limit</h3>
          <p>
            All evidence artifacts (PDFs, images, logs) are retained for exactly <strong>365 days</strong> from their creation date.
          </p>
          <p>
            <strong>Warning:</strong> After 1 year, data is permanently purged. There is no
            "soft delete" or recovery option. If you need to keep records for longer (e.g.,
            for court proceedings), you must export them before the expiration date.
          </p>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Best Practices"
        icon={History}
      >
        <p>
          Follow these guidelines to maximize the effectiveness of your evidence:
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Be Specific:</strong> Link evidence directly to the relevant Tradeline, Packet,
            or Obligation Instance. Don't just upload it to the general pool.
          </li>
          <li>
            <strong>Name Clearly:</strong> Use descriptive filenames like <code>Equifax-Report-2023-10-01.pdf</code> instead of <code>scan001.pdf</code>.
          </li>
          <li>
            <strong>Upload Immediately:</strong> Upload bureau responses as soon as received to
            create contemporaneous evidence records.
          </li>
          <li>
            <strong>Update Frequently:</strong> Upload new credit reports regularly (e.g., every
            30-45 days) to track changes and verify if disputes were successful.
          </li>
          <li>
            <strong>Verify Hashes:</strong> After uploading, verify the file hash matches your
            local copy to ensure upload integrity.
          </li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};