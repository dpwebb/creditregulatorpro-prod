import React from 'react';
import { 
  ShieldCheck, 
  ListChecks, 
  Workflow, 
  Briefcase, 
  Database, 
  FileText, 
  CheckCircle2,
  Lock,
  Globe,
  History,
  Search
} from 'lucide-react';
import { Badge } from './Badge';
import styles from './ComplianceAuditDocs.module.css';

export const ComplianceAuditDocs = ({ className }: { className?: string }) => {
  return (
    <div className={`${styles.container} ${className || ''}`}>
      <header className={styles.header}>
        <div className={styles.titleWrapper}>
          <ShieldCheck className={styles.mainIcon} size={32} />
          <h1 className={styles.title}>Compliance Audit System</h1>
        </div>
        <p className={styles.subtitle}>
          A robust framework for tracking, verifying, and defending regulatory compliance across the Credit Regulator Pro ecosystem.
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <FileText className={styles.sectionIcon} size={20} />
          <h2 className={styles.sectionTitle}>Overview</h2>
        </div>
        <div className={styles.card}>
          <p>
            The Compliance Audit System is the source of truth for all regulatory actions taken within the application. 
            It ensures that every packet generated, every dispute initiated, and every evidence event recorded is 
            mapped directly to the specific statutes and obligations that govern it. This system provides the 
            necessary transparency for legal defensibility and regulatory reporting.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <ListChecks className={styles.sectionIcon} size={20} />
          <h2 className={styles.sectionTitle}>Key Features</h2>
        </div>
        <div className={styles.grid}>
          <div className={styles.featureItem}>
            <CheckCircle2 className={styles.featureIcon} size={18} />
            <div>
              <span className={styles.featureLabel}>Automatic Tracking</span>
              <p className={styles.featureDesc}>Regulations applied to each packet are recorded at the moment of generation.</p>
            </div>
          </div>
          <div className={styles.featureItem}>
            <Lock className={styles.featureIcon} size={18} />
            <div>
              <span className={styles.featureLabel}>Cryptographic Integrity</span>
              <p className={styles.featureDesc}>Integration with the evidence chain using SHA-256 hashes for immutability.</p>
            </div>
          </div>
          <div className={styles.featureItem}>
            <Globe className={styles.featureIcon} size={18} />
            <div>
              <span className={styles.featureLabel}>CA Region Specific</span>
              <p className={styles.featureDesc}>Strict enforcement of Canada-only data residency and regulatory policies.</p>
            </div>
          </div>
          <div className={styles.featureItem}>
            <Search className={styles.featureIcon} size={18} />
            <div>
              <span className={styles.featureLabel}>Audit Trail</span>
              <p className={styles.featureDesc}>Comprehensive history for legal compliance and internal review.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Workflow className={styles.sectionIcon} size={20} />
          <h2 className={styles.sectionTitle}>How It Works</h2>
        </div>
        <div className={styles.card}>
          <ol className={styles.steps}>
            <li>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepContent}>
                <strong>Packet Generation:</strong> When a packet is generated, the system automatically identifies and records which regulations were applied based on the dispute context.
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepContent}>
                <strong>Relational Linking:</strong> Immutable links are created between the packet, the specific <Badge variant="info">Obligation</Badge>, and the <Badge variant="primary">Statute Version</Badge> used.
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepContent}>
                <strong>Evidence Integration:</strong> Each compliance record is tied to a unique <Badge variant="success">Evidence Event</Badge> in the cryptographic chain.
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>4</div>
              <div className={styles.stepContent}>
                <strong>Metadata Capture:</strong> Records include precise timestamps, selection reasons, and full regulatory references for complete context.
              </div>
            </li>
            <li>
              <div className={styles.stepNumber}>5</div>
              <div className={styles.stepContent}>
                <strong>Immutability:</strong> Data is stored with the evidence hash, ensuring it cannot be altered after the fact, providing legal defensibility.
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Briefcase className={styles.sectionIcon} size={20} />
          <h2 className={styles.sectionTitle}>Use Cases</h2>
        </div>
        <div className={styles.grid}>
          <div className={styles.useCaseCard}>
            <h3 className={styles.useCaseTitle}>Legal Verification</h3>
            <p>Providing proof of compliance during regulatory audits or legal proceedings.</p>
          </div>
          <div className={styles.useCaseCard}>
            <h3 className={styles.useCaseTitle}>Dispute Analysis</h3>
            <p>Tracking which regulations were tested and their outcomes in specific disputes.</p>
          </div>
          <div className={styles.useCaseCard}>
            <h3 className={styles.useCaseTitle}>Procedural Exhaustion</h3>
            <p>Gathering evidence to support claims that all procedural remedies have been exhausted.</p>
          </div>
          <div className={styles.useCaseCard}>
            <h3 className={styles.useCaseTitle}>Historical Review</h3>
            <p>Analyzing how regulation application has evolved over time with statute updates.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Database className={styles.sectionIcon} size={20} />
          <h2 className={styles.sectionTitle}>Technical Details</h2>
        </div>
        <div className={styles.card}>
          <div className={styles.techGrid}>
            <div className={styles.techItem}>
              <span className={styles.techLabel}>Database Table</span>
              <code className={styles.code}>packet_compliance_audit</code>
            </div>
            <div className={styles.techItem}>
              <span className={styles.techLabel}>Primary Fields</span>
              <div className={styles.codeList}>
                <code className={styles.code}>packet_id</code>
                <code className={styles.code}>obligation_id</code>
                <code className={styles.code}>statute_version_id</code>
                <code className={styles.code}>evidence_event_id</code>
                <code className={styles.code}>region (CA)</code>
              </div>
            </div>
            <div className={styles.techItem}>
              <span className={styles.techLabel}>Integrity</span>
              <p className={styles.techDesc}>Foreign key constraints ensure data consistency across all related entities.</p>
            </div>
            <div className={styles.techItem}>
              <span className={styles.techLabel}>Performance</span>
              <p className={styles.techDesc}>Automatic indexing on <code className={styles.code}>packet_id</code> and <code className={styles.code}>region</code> for high-speed retrieval.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};