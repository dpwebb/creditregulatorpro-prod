import { Link } from "react-router-dom";
import { Shield, Lock, Globe, UserCheck, History, Link as LinkIcon, Gauge } from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import styles from "./KBSecurity.module.css";

export const KBSecurity = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        id="hash-chain"
        title="SHA-256 Hash Chain Integrity"
        icon={LinkIcon}
        badge="CRYPTOGRAPHIC"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro uses SHA-256 cryptographic hash chaining to create an immutable evidence trail
          that is mathematically verifiable and court-admissible.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="chain-mechanism">
            <AccordionTrigger>Chain Mechanism</AccordionTrigger>
            <AccordionContent>
              <p>
                Every evidence event (upload, packet generation, bureau communication) computes:
              </p>
              <code className={styles.formula}>
                newHash = SHA256(previousHash + currentPayload)
              </code>
              <p>
                The chain starts with genesis block (hash: "GENESIS") and each subsequent event
                extends the chain. Any tampering breaks the hash sequence, making alterations
                immediately detectable.
              </p>
              <ul className={styles.list}>
                <li><strong>File Integrity:</strong> Each uploaded file is hashed independently</li>
                <li><strong>Chain Integrity:</strong> Hash chain links all events chronologically</li>
                <li><strong>Verification:</strong> Recompute chain from genesis to detect any modifications</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="legal-admissibility">
            <AccordionTrigger>Legal Admissibility</AccordionTrigger>
            <AccordionContent>
              <p>
                Hash chains provide court-admissible proof that:
              </p>
              <ul>
                <li>Evidence has not been altered since creation</li>
                <li>Chronological sequence is accurate and verifiable</li>
                <li>All actions are attributable to specific users and timestamps</li>
              </ul>
              <p>
                Evidence packages include hash verification tables allowing independent validation
                by forensic experts or opposing counsel.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="rate-limiting"
        title="Rate Limiting on Sensitive Operations"
        icon={Gauge}
        badge="ABUSE PREVENTION"
      >
        <p>
          Credit Regulator Pro enforces rate limits on sensitive operations to prevent abuse and ensure
          deliberate evidence curation.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="limits">
            <AccordionTrigger>Rate Limit Rules</AccordionTrigger>
            <AccordionContent>
              <div className={styles.limitsGrid}>
                <div className={styles.limitCard}>
                  <h4>Evidence Uploads</h4>
                  <Badge variant="warning">10 per hour</Badge>
                  <p>Prevents bulk upload abuse and encourages careful evidence selection.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>Packet Generation</h4>
                  <Badge variant="warning">5 per hour</Badge>
                  <p>Ensures packets are reviewed and intentionally sent, not auto-generated.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>Compliance Rescans</h4>
                  <Badge variant="info">20 per day</Badge>
                  <p>Allows testing but prevents excessive API load.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>API Requests (General)</h4>
                  <Badge variant="info">1000 per hour</Badge>
                  <p>Standard rate limiting for all authenticated requests.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>Anonymous Upload</h4>
                  <Badge variant="warning">5 per 22 min</Badge>
                  <p>Limits the free Try Upload feature.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>Report Parsing</h4>
                  <Badge variant="warning">5 per hour</Badge>
                  <p>Limits how often credit reports can be processed.</p>
                </div>

                <div className={styles.limitCard}>
                  <h4>Scraping Detection</h4>
                  <Badge variant="error">200 per 5 min</Badge>
                  <p>Triggers a flag for unusually high request volume.</p>
                </div>
              </div>
              <p className={styles.note}>
                Rate limits reset on a rolling window basis. Exceeding limits returns HTTP 429
                with retry-after header.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="content-protection"
        title="Content Protection"
        icon={Shield}
        badge="ACTIVE"
        badgeVariant="primary"
      >
        <p>
          We protect the content on our platform from being copied without permission.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="protection-measures">
            <AccordionTrigger>How we protect content</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Right-Click Disabled:</strong> You cannot right-click on our unique pages when using a computer.</li>
                <li><strong>Copy Protection:</strong> If someone tries to copy text, it gets replaced with a warning message.</li>
                <li><strong>Digital Watermarks:</strong> PDF letters have invisible marks that link back to the account that made them. This helps us track where they came from.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="suspicious-activity"
        title="Suspicious Activity Detection"
        icon={Shield}
        badge="AUTOMATED"
        badgeVariant="warning"
      >
        <p>
          Our system watches for unusual patterns to keep everyone's data safe.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="automated-detection">
            <AccordionTrigger>How it works</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Pattern Matching:</strong> The system looks for actions like too many requests happening too fast.</li>
                <li><strong>Account Limits:</strong> If the system sees suspicious behavior, it might temporarily limit what the account can do.</li>
                <li><strong>Data Protection:</strong> These automatic blocks help make sure that no one can steal or abuse the data of other users.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="audit-logging"
        title="Comprehensive Audit Logging"
        icon={History}
        badge="COMPLIANCE"
      >
        <p>
          Every action in Credit Regulator Pro is logged to an immutable audit trail for compliance,
          security, and evidence purposes.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="logged-actions">
            <AccordionTrigger>Logged Actions</AccordionTrigger>
            <AccordionContent>
              <p>
                The audit log captures:
              </p>
              <ul className={styles.list}>
                <li><strong>Authentication:</strong> LOGIN, LOGOUT, LOGIN_FAILED with IP and user agent</li>
                <li><strong>CRUD Operations:</strong> CREATE, READ, UPDATE, DELETE on all entities</li>
                <li><strong>Evidence Operations:</strong> UPLOAD, DOWNLOAD, DELETE with file hashes</li>
                <li><strong>Packet Operations:</strong> PACKET_GENERATED, CHALLENGE_INITIATED</li>
                <li><strong>System Operations:</strong> ESCALATION_TRIGGERED, EXHAUSTION_REACHED</li>
              </ul>
              <p>
                Each log entry includes:
              </p>
              <ul className={styles.list}>
                <li>Action type and timestamp (microsecond precision)</li>
                <li>User ID, IP address, and User-Agent</li>
                <li>Entity type and ID affected</li>
                <li>Status (SUCCESS/FAILURE) with error messages</li>
                <li>Detailed change records (before/after states)</li>
                <li>Region tag (always "CA")</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="immutability">
            <AccordionTrigger>Audit Log Immutability</AccordionTrigger>
            <AccordionContent>
              <p>
                Audit logs cannot be deleted or modified. They are:
              </p>
              <ul>
                <li>Written to append-only database table</li>
                <li>Retained for the duration of the data retention period (1 year)</li>
                <li>Included in evidence packages for legal proceedings</li>
              </ul>
              <p>
                If a log write fails, the system logs to console but does not fail the main
                operation, ensuring audit failures don't break application functionality while
                still capturing the failure.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="jwt-sessions"
        title="JWT-Based Session Management"
        icon={UserCheck}
        badge="STATELESS"
      >
        <p>
          Credit Regulator Pro uses JSON Web Tokens (JWT) for stateless, secure session management.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="jwt-implementation">
            <AccordionTrigger>JWT Implementation</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li>
                  <strong>Token Generation:</strong> On successful login, JWT issued with user ID
                  and role claims
                </li>
                <li>
                  <strong>Token Expiry:</strong> Tokens expire after configurable period (default: 24 hours)
                </li>
                <li>
                  <strong>Refresh Mechanism:</strong> Refresh tokens allow seamless re-authentication
                </li>
                <li>
                  <strong>Signature Verification:</strong> All tokens verified with secret key on
                  each request
                </li>
              </ul>
              <p>
                JWT tokens are stored in HTTP-only cookies to prevent XSS attacks and include
                CSRF protection.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="rbac"
        title="Role-Based Access Control (RBAC)"
        icon={Shield}
        badge="AUTHORIZATION"
      >
        <p>
          Credit Regulator Pro implements role-based access control with three roles:
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="roles">
            <AccordionTrigger>User Roles</AccordionTrigger>
            <AccordionContent>
              <div className={styles.rolesGrid}>
                <div className={styles.roleCard}>
                  <Badge variant="default">USER</Badge>
                  <h4>Standard User</h4>
                  <p>Can access:</p>
                  <ul>
                    <li>Own tradelines and packets</li>
                    <li>Evidence uploads and management</li>
                    <li>Packet generation and tracking</li>
                    <li>Compliance scanner and analytics</li>
                    <li>Profile settings</li>
                  </ul>
                  <p>Cannot access:</p>
                  <ul>
                    <li>Other users' data</li>
                    <li>System administration functions</li>
                    <li>Security logs</li>
                  </ul>
                </div>

                <div className={styles.roleCard}>
                  <Badge variant="warning">SUPPORT</Badge>
                  <h4>Support Agent</h4>
                  <p>Can access:</p>
                  <ul>
                    <li>Manage ticket queue</li>
                    <li>Reply to users and assign tickets</li>
                    <li>Bypass subscription checks</li>
                  </ul>
                  <p>Cannot access:</p>
                  <ul>
                    <li>Admin settings</li>
                    <li>User management</li>
                    <li>Compliance configuration</li>
                  </ul>
                </div>

                <div className={styles.roleCard}>
                  <Badge variant="error">ADMIN</Badge>
                  <h4>Administrator</h4>
                  <p>Can access all USER permissions plus:</p>
                  <ul>
                    <li>User management</li>
                    <li>System-wide analytics</li>
                    <li>Security audit logs</li>
                    <li>Bureau and creditor management</li>
                    <li>Regulatory update management</li>
                    <li>Manual escalation triggers</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="data-policy"
        title="Data Retention & Sovereignty"
        icon={Globe}
        badge="Canada Only"
        badgeVariant="error"
      >
        <p>
          Credit Regulator Pro is strictly engineered for the Canadian jurisdiction. This
          impacts how data is stored and processed.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="region-lock">
            <AccordionTrigger>Region Lock Policy</AccordionTrigger>
            <AccordionContent>
              <p>
                All data storage is physically located within Canada (ca-central-1).
                Cross-border data transfer is blocked at the application level.
              </p>
              <div className={styles.alert}>
                <Badge variant="error">RESTRICTION</Badge>
                <p>
                  You cannot upload credit reports from US bureaus (Experian US,
                  TransUnion US, Equifax US). The system will reject non-Canadian
                  postal codes.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="retention">
            <AccordionTrigger>1-Year Retention Policy</AccordionTrigger>
            <AccordionContent>
              <p>
                To minimize liability, Credit Regulator Pro enforces a strict <strong>1-year
                evidence retention policy</strong>.
              </p>
              <ul>
                <li>
                  <strong>Active Evidence:</strong> Kept for 1 year from the date
                  of creation.
                </li>
                <li>
                  <strong>Expired Evidence:</strong> Automatically purged after
                  365 days unless marked for "Legal Hold".
                </li>
                <li>
                  <strong>User Accounts:</strong> Inactive accounts are flagged
                  after 6 months.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="account-security"
        title="Account Security"
        icon={Lock}
      >
        <p>
          Protecting your personal information is paramount.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="profile-settings">
            <AccordionTrigger>Profile & Identity</AccordionTrigger>
            <AccordionContent>
              <p>
                Your <Link to="/my-info?tab=profile">Profile Settings</Link> contain
                the legal identity used for generating dispute letters.
              </p>
              <p>
                <strong>Important:</strong> The name and address in your profile
                MUST match the identification documents you provide to bureaus.
                Mismatches are the #1 cause of dispute rejection.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="session-mgmt">
            <AccordionTrigger>Session Management</AccordionTrigger>
            <AccordionContent>
              <p>
                Sessions automatically expire after a period of inactivity (24 hours).
                Concurrent logins are monitored.
              </p>
              <p>
                If you suspect unauthorized access, change your password immediately
                and review the <Link to="/admin-security">Security Logs</Link> (Admin only).
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};