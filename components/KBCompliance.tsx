import { Link } from "react-router-dom";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Siren,
  ScanSearch,
  ArrowRight,
} from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { KBComplianceAutoEscalation } from "./KBComplianceAutoEscalation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import styles from "./KBCompliance.module.css";

export const KBCompliance = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        id="compliance-scanner"
        title="Compliance Finding Checks"
        icon={ScanSearch}
        badge="Auto-Detection"
        badgeVariant="primary"
      >
        <p>
          The compliance scanner is the heart of Credit Regulator Pro. It checks each account against authority-backed finding categories and supporting runtime rules. Use those findings to ask for verification, correction, or removal when the reporting cannot be supported.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="scanner-modules">
            <AccordionTrigger>Core Detection Areas</AccordionTrigger>
            <AccordionContent>
              <div className={styles.moduleGrid}>
                <div className={styles.moduleCard}>
                  <Badge variant="error">1</Badge>
                  <h4>Time Tricks</h4>
                  <p>Finds dates that were changed to keep an account on your report longer.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">2</Badge>
                  <h4>Mismatched Details</h4>
                  <p>Finds accounts that look different across bureaus.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">3</Badge>
                  <h4>Old Debts</h4>
                  <p>Finds accounts that are too old to report based on your province.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">4</Badge>
                  <h4>Changed Payments</h4>
                  <p>Finds payment histories that changed secretly.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">5</Badge>
                  <h4>Math Errors</h4>
                  <p>Finds impossible math, like owing more past due than your total balance.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">6</Badge>
                  <h4>Missing Paperwork</h4>
                  <p>Finds broken links in the paperwork they need.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">7</Badge>
                  <h4>Missed Deadlines</h4>
                  <p>Finds when they take too long to reply.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">8</Badge>
                  <h4>Double Trouble</h4>
                  <p>Finds when two collection agencies report the same debt.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">9</Badge>
                  <h4>Changed Limits</h4>
                  <p>Finds credit limits that were changed without reason.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">10</Badge>
                  <h4>Bankruptcy Errors</h4>
                  <p>Finds discharged debts that still show a balance.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">11</Badge>
                  <h4>Identity Signs</h4>
                  <p>Finds signs of fraud or identity theft.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">12</Badge>
                  <h4>Confused Status</h4>
                  <p>Finds accounts that say 'Paid' but still show a balance.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">13</Badge>
                  <h4>Weak Replies</h4>
                  <p>Finds answers that are generic or dismissive.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">14</Badge>
                  <h4>Bureau Conflicts</h4>
                  <p>Finds data that does not match between Equifax and TransUnion.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">15</Badge>
                  <h4>Missing Details</h4>
                  <p>Finds missing required fields.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">16</Badge>
                  <h4>Format Errors</h4>
                  <p>Finds accounts that break standard reporting rules.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">17</Badge>
                  <h4>No Validation</h4>
                  <p>Finds when collectors fail to prove you owe the debt.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">18</Badge>
                  <h4>Broken Chain</h4>
                  <p>Finds missing proof that a collector actually bought your debt.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">19</Badge>
                  <h4>Too Old to Collect</h4>
                  <p>Finds collection attempts on very old debts.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">20</Badge>
                  <h4>Reply Checks</h4>
                  <p>Checks if their letters are missing important details.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">21</Badge>
                  <h4>Failed Investigation</h4>
                  <p>Finds when a bureau takes more than 30 days to investigate.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">22</Badge>
                  <h4>No Notice</h4>
                  <p>Finds when they fail to tell you the result of an investigation.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">23</Badge>
                  <h4>Secret Return</h4>
                  <p>Finds when a deleted item is put back without telling you.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">24</Badge>
                  <h4>Bad Access</h4>
                  <p>Finds when someone looks at your report without a good reason.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">25</Badge>
                  <h4>Not Marked</h4>
                  <p>Finds active disputes that do not say 'In Dispute'.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">26</Badge>
                  <h4>Date Moving</h4>
                  <p>Finds date changes that may make an old account look newer than the source evidence supports.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">27</Badge>
                  <h4>Code Mismatch</h4>
                  <p>Finds account statuses that do not match the payment history.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">28</Badge>
                  <h4>Joint Errors</h4>
                  <p>Finds shared accounts that are missing shared codes.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">29</Badge>
                  <h4>User Errors</h4>
                  <p>Finds authorized users reported as the primary owner.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">30</Badge>
                  <h4>Revenge Reporting</h4>
                  <p>Finds negative changes right after you send a dispute.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">31</Badge>
                  <h4>No License</h4>
                  <p>Finds collection agencies acting without a license in your province.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">32</Badge>
                  <h4>Extra Fees</h4>
                  <p>Finds added fees that were not in the original agreement.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">33</Badge>
                  <h4>Ignored Payments</h4>
                  <p>Finds 'Paid' accounts that still show you owe money.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="error">34</Badge>
                  <h4>Double Reporting</h4>
                  <p>Finds the same debt reported twice by the same collector.</p>
                </div>

                <div className={styles.moduleCard}>
                  <Badge variant="warning">35</Badge>
                  <h4>Restarting the Clock</h4>
                  <p>Finds attempts to restart the time limit on an old debt.</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="metro2-validation">
            <AccordionTrigger>Format Check System</AccordionTrigger>
            <AccordionContent>
              <p>
                Credit Regulator Pro includes format checks to review whether account data follows supported reporting standards.
              </p>
              <ul>
                <li>
                  <strong>Required Details:</strong> Account number, status, opened date, current balance.
                </li>
                <li>
                  <strong>Joint Accounts:</strong> Shared accounts must have proper codes showing two people.
                </li>
                <li>
                  <strong>Date Math:</strong> The first late date must make sense.
                </li>
                <li>
                  <strong>Status and Balance:</strong> Paid or closed accounts must have zero balance.
                </li>
              </ul>
              <div className={styles.note}>
                <Badge variant="info">TECHNICAL</Badge>
                <p>
                  We show the rule or standard involved, how serious the finding is, and what value appears inconsistent.
                </p>
                <p>
                  Findings are saved in your account. We show confidence, explain the issue simply, and suggest next steps.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="collection-agent-rules">
            <AccordionTrigger>Collection Agency Rules</AccordionTrigger>
            <AccordionContent>
              <p>
                We review collection accounts against local rules and available source data. When the record appears unsupported or inconsistent, it gives you a stronger reason to challenge it.
              </p>
              <h4>Time Limits by Province</h4>
              <p className={styles.subText}>Reporting and collection limits vary by province and account facts. These common limitation windows are used as review anchors:</p>
              <div className={styles.tableWrapper}>
                <table className={styles.simpleTable}>
                  <thead>
                    <tr>
                      <th>Region</th>
                      <th>Time Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>ON, BC, AB, SK</td><td>2 Years</td></tr>
                    <tr><td>QC</td><td>3 Years</td></tr>
                    <tr><td>MB, NS, NB, PE, NL, YT, NT, NU</td><td>6 Years</td></tr>
                  </tbody>
                </table>
              </div>
              
              <h4>Important Rules</h4>
              <ul>
                <li><strong>Supporting the Debt:</strong> Collectors should be able to provide records supporting ownership, balance, and collection authority when challenged.</li>
                <li><strong>Warning Letter:</strong> They must send you a letter before adding the debt to your credit report.</li>
                <li><strong>Who You Owe:</strong> They must tell you who originally owned the debt.</li>
                <li><strong>While Disputing:</strong> They cannot say the debt is "active" if you are currently challenging it.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="scan-execution">
            <AccordionTrigger>How the Scanner Works</AccordionTrigger>
            <AccordionContent>
              <p>
                The scanner runs automatically when you add or change an account. Results are saved to your account with:
              </p>
              <ul>
                <li><strong>Confidence Score:</strong> How sure we are about the error (0-100).</li>
                <li><strong>User Explanation:</strong> A simple explanation of what went wrong.</li>
                <li><strong>Technical Details:</strong> The raw data we found.</li>
                <li><strong>Suggested Action:</strong> The best way to challenge the error.</li>
                <li><strong>Authority Reference:</strong> Which local, federal, or reporting-standard reference supports the finding.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="compliance-calendar"
        title="Compliance Calendar & Deadlines"
        icon={CalendarClock}
        badge="Critical"
        badgeVariant="error"
      >
        <p>
          The Compliance Calendar helps you track everything. It tracks rule updates and deadlines so you never miss an important date.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="calendar-overview">
            <AccordionTrigger>Calendar Overview</AccordionTrigger>
            <AccordionContent>
              <p>
                The <Link to="/compliance-calendar">Compliance Calendar</Link> shows two types of events:
              </p>
              <ul>
                <li>
                  <strong>Rule Updates:</strong> Dates when new laws take effect.
                </li>
                <li>
                  <strong>Letter Deadlines:</strong> Dates when a company must reply to your letter.
                </li>
              </ul>
              <p>
                Events are colored to show how urgent they are:
                <br />
                <span className={styles.legendItem}>
                  <span className={`${styles.dot} ${styles.red}`}></span> Red:
                  Late or Due Today
                </span>
                <br />
                <span className={styles.legendItem}>
                  <span className={`${styles.dot} ${styles.orange}`}></span>{" "}
                  Orange: Due within 7 days
                </span>
                <br />
                <span className={styles.legendItem}>
                  <span className={`${styles.dot} ${styles.green}`}></span>{" "}
                  Green: Done
                </span>
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="statutory-timeframes">
            <AccordionTrigger>Legal Time Limits</AccordionTrigger>
            <AccordionContent>
              <p>
                We automatically calculate the deadline based on your province and the laws you are using.
              </p>
              <h3>Common Deadlines:</h3>
              <ul>
                <li>
                  <strong>Federal Privacy Law:</strong> Usually 30 days to reply.
                </li>
                <li>
                  <strong>Ontario:</strong> 30 business days to finish an investigation.
                </li>
                <li>
                  <strong>British Columbia:</strong> 30 business days.
                </li>
                <li>
                  <strong>Quebec:</strong> 30 days strict limit.
                </li>
              </ul>
              <div className={styles.note}>
                <Badge variant="warning">IMPORTANT</Badge>
                <p>
                  The system automatically skips weekends and holidays when calculating "business days".
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="auto-escalation">
            <AccordionTrigger>Auto-Escalation System</AccordionTrigger>
            <AccordionContent>
              <p>
                When a company misses a deadline, the system automatically suggests the next step in the challenge plan.
              </p>
              <KBComplianceAutoEscalation />
              <ul className={styles.escalationPhases}>
                <li>
                  <strong>Warning:</strong> 3 days before the deadline. The system prepares a follow-up letter.
                </li>
                <li>
                  <strong>Missed Deadline:</strong> 1 day after the deadline. The status changes to show they did not reply.
                </li>
                <li>
                  <strong>Next Step:</strong> Starts the next letter in the plan so you do not lose time.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="checking-status">
            <AccordionTrigger>Checking Status</AccordionTrigger>
            <AccordionContent>
              <p>
                You can check the status of any letter in the{" "}
                <Link to="/packets">Packets Dashboard</Link> or the{" "}
                <Link to="/compliance-audit">Compliance Audit</Link> page.
              </p>
              <h3>Status Labels:</h3>
              <ul>
                <li>
                  <Badge variant="success">GOOD</Badge> They replied on time.
                </li>
                <li>
                  <Badge variant="warning">AT RISK</Badge> Deadline is coming up soon.
                </li>
                <li>
                  <Badge variant="error">BROKEN RULE</Badge> They missed the deadline.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="regulatory-updates"
        title="Rule Updates"
        icon={Siren}
        badge="Live Feed"
      >
        <p>
          Credit Regulator Pro tracks Canadian credit-law and reporting-rule changes for admin review.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="update-process">
            <AccordionTrigger>How We Update</AccordionTrigger>
            <AccordionContent>
              <ol>
                <li>
                  <strong>Find:</strong> We look for new laws or rule changes.
                </li>
                <li>
                  <strong>Review:</strong> Our team reviews how important the change is.
                </li>
                <li>
                  <strong>Apply:</strong> We add the new rules to our built-in checks.
                </li>
                <li>
                  <strong>Alert:</strong> We notify you if a rule change affects your current challenges.
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};
