import { Scale, ScanSearch, MapPin } from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { getViolationLabel } from "../helpers/getViolationLabel";
import { regulationRegistry } from "../helpers/regulationRegistry";
import styles from "./KBRulesRegulations.module.css";

const provinceNames: Record<string, string> = {
  ON: "Ontario",
  BC: "British Columbia",
  AB: "Alberta",
  QC: "Quebec",
  SK: "Saskatchewan",
  MB: "Manitoba",
  NB: "New Brunswick",
  NS: "Nova Scotia",
  PE: "Prince Edward Island",
  NL: "Newfoundland and Labrador",
  NT: "Northwest Territories",
  NU: "Nunavut",
  YT: "Yukon",
};

const categoryLabels: Record<string, string> = {
  CRA_ACCURACY: "Accuracy & Evidence",
  CRA_REPORTING_LIMIT: "Time Limits",
  CRA_REINVESTIGATION: "Disputes & Investigations",
  CRA_REINSERTION: "Bureau Reinsertion",
  CRA_CONSUMER_STATEMENT: "Consumer Statements",
  CRA_PERMISSIBLE_PURPOSE: "Permissible Purpose",
  CRA_DISCLOSURE: "Your Right to See Your File",
  COLLECTION_ACT: "Collections",
  LIMITATIONS_ACT: "Statute of Limitations",
};

const PROVINCIAL_CRA_MAPPING: Record<string, any> = {};

Object.keys(provinceNames).forEach((provCode) => {
  const baseEntry = regulationRegistry.getRegulationById(`${provCode}_CRA_ACCURACY`);
  if (!baseEntry) return;

  const sections: Record<string, string> = {};
  
  [
    "CRA_ACCURACY",
    "CRA_REPORTING_LIMIT",
    "CRA_REINVESTIGATION",
    "CRA_REINSERTION",
    "CRA_CONSUMER_STATEMENT",
    "CRA_PERMISSIBLE_PURPOSE",
    "CRA_DISCLOSURE",
    "COLLECTION_ACT",
    "LIMITATIONS_ACT"
  ].forEach(key => {
    const entry = regulationRegistry.getRegulationById(`${provCode}_${key}`);
    if (entry) {
      sections[key] = entry.citation;
    }
  });

  PROVINCIAL_CRA_MAPPING[provCode] = {
    statuteName: baseEntry.statute,
    sections
  };
});

export const KBRulesRegulations = () => {
  const renderViolationCards = (
    violations: Array<{ id: string; desc: string; laws: string[] }>
  ) => {
    return (
      <div className={styles.moduleGrid}>
        {violations.map((v) => (
          <div key={v.id} className={styles.moduleCard}>
            <h4>{getViolationLabel(v.id)}</h4>
            <p>{v.desc}</p>
            <div className={styles.lawsSection}>
              <span className={styles.lawsLabel}>Laws that protect you:</span>
              <div className={styles.lawTags}>
                {v.laws.map((law, idx) => (
                  <span key={idx} className={styles.lawTag}>
                    {law}
                  </span>
                ))}
              </div>
            </div>
            <p className={styles.noteText}>
              Your province's laws also apply — see the Provincial Laws section
              below.
            </p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* SECTION 1 */}
      <KnowledgeBaseSection
        title="Federal & National Rules"
        icon={Scale}
        badge="FOUNDATION"
        badgeVariant="primary"
      >
        <p>
          These are the main national rules that all credit bureaus, lenders, and
          collectors must follow when they handle your data in Canada.
        </p>

        <div className={styles.moduleGrid}>
          <div className={styles.moduleCard}>
            <Badge variant="info">PIPEDA</Badge>
            <h4>Principle 4.6 (Accuracy)</h4>
            <p>Companies must keep your info correct and up-to-date.</p>
          </div>

          <div className={styles.moduleCard}>
            <Badge variant="info">PIPEDA</Badge>
            <h4>Principle 4.6.1 (Appropriate Info)</h4>
            <p>
              Your info must be good enough that no one makes a bad decision about
              you based on bad data.
            </p>
          </div>

          <div className={styles.moduleCard}>
            <Badge variant="info">PIPEDA</Badge>
            <h4>Principle 4.5 (Retention Limits)</h4>
            <p>They can only keep your info as long as they actually need it.</p>
          </div>

          <div className={styles.moduleCard}>
            <Badge variant="info">PIPEDA</Badge>
            <h4>Principle 4.3 (Consent)</h4>
            <p>They need your OK to collect or share your personal info.</p>
          </div>

          <div className={styles.moduleCard}>
            <Badge variant="warning">FEDERAL LAW</Badge>
            <h4>Bankruptcy and Insolvency Act</h4>
            <p>
              Once you are discharged from bankruptcy, those debts are legally
              gone. (R.S.C. 1985, c. B-3, s. 178)
            </p>
          </div>

          <div className={styles.moduleCard}>
            <Badge variant="default">INDUSTRY STANDARD</Badge>
            <h4>Metro2 CRRG</h4>
            <p>
              The industry rulebook that says exactly how credit info must be
              reported in Canada.
            </p>
          </div>
        </div>
      </KnowledgeBaseSection>

      {/* SECTION 2 */}
      <KnowledgeBaseSection
        title="What We Check & Which Laws Apply"
        icon={ScanSearch}
        badge="AUTHORITY-MAPPED"
        badgeVariant="error"
      >
        <p>
          Credit Regulator Pro automatically scans your credit report for these
          common issues. When it finds a problem, it uses the mapped references listed
          below to support a verification, correction, or removal request.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="group1">
            <AccordionTrigger>1. Date & Time Problems</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "TEMPORAL_MANIPULATION",
                  desc: "The dates on this account look like they were changed to trick the system.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "STATUTE_OF_LIMITATIONS",
                  desc: "This debt is too old to be on your credit report anymore.",
                  laws: ["PIPEDA 4.5"],
                },
                {
                  id: "FURNISHER_REAGING_VIOLATION",
                  desc: "A company appears to have changed dates in a way that could make an old debt look newer than the source record supports.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "DATE_LOGIC_IMPOSSIBLE",
                  desc: "The dates do not make sense, like saying an account was closed before it was opened.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
                {
                  id: "LAST_ACTIVITY_DATE_MANIPULATION",
                  desc: "The date you last did something on this account was changed to hurt your score.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "STALE_REPORTING_FAILURE",
                  desc: "This company has not updated your account information recently.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group2">
            <AccordionTrigger>2. Balance & Money Problems</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "BALANCE_CALCULATION_VIOLATION",
                  desc: "The math on your balance does not add up.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
                {
                  id: "CREDIT_LIMIT_MANIPULATION",
                  desc: "Your credit limit is reported wrong, which makes you look riskier.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "CLOSED_ACCOUNT_BALANCE_INFLATION",
                  desc: "Your closed account shows a balance going up, which should not happen.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
                {
                  id: "COLLECTOR_UNAUTHORIZED_FEES",
                  desc: "A collector added extra fees that were not in your original agreement.",
                  laws: ["Provincial Laws"],
                },
                {
                  id: "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION",
                  desc: "A collector did not count a payment you made.",
                  laws: ["Provincial Laws"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group3">
            <AccordionTrigger>3. Missing or Wrong Information</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "DOCUMENTATION_CHAIN_FAILURE",
                  desc: "Important details are missing from your account record.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.6.1", "Metro2 CRRG"],
                },
                {
                  id: "ACCOUNT_STATUS_INCONSISTENCY",
                  desc: "The status of your account does not match the other details shown.",
                  laws: ["PIPEDA 4.6.1"],
                },
                {
                  id: "FURNISHER_STATUS_CODE_MISMATCH",
                  desc: "The code they used for your account status is wrong.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "PAYMENT_HISTORY_MANIPULATION",
                  desc: "Your payment history was changed or reported wrong.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
                {
                  id: "RETROACTIVE_HISTORY_MANIPULATION",
                  desc: "A company went back and changed your past payment history.",
                  laws: ["PIPEDA 4.6", "Metro2 CRRG"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group4">
            <AccordionTrigger>4. Bureau & Investigation Failures</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "BUREAU_INVESTIGATION_FAILURE",
                  desc: "The credit bureau did not finish checking your dispute properly.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "BUREAU_NOTIFICATION_FAILURE",
                  desc: "The credit bureau forgot to tell you important news about your file.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "BUREAU_REINSERTION_VIOLATION",
                  desc: "An item you removed was secretly put back on your report.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "BUREAU_ACCESS_VIOLATION",
                  desc: "Someone looked at your credit report without your permission.",
                  laws: ["PIPEDA 4.3"],
                },
                {
                  id: "BUREAU_DISPUTE_MARKING_FAILURE",
                  desc: "They failed to mark your account as 'In Dispute'.",
                  laws: ["PIPEDA 4.6.1"],
                },
                {
                  id: "INVESTIGATION_RUBBER_STAMP",
                  desc: "They rejected your dispute without actually looking into it.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "CONSUMER_STATEMENT_SUPPRESSION",
                  desc: "Your personal statement or warning was hidden from your report.",
                  laws: ["PIPEDA 4.6.1"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group5">
            <AccordionTrigger>5. Response Quality Issues</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "CREDITOR_RESPONSE_QUALITY",
                  desc: "The company's reply to your letter was not good enough.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "RESPONSE_MOV_MISSING",
                  desc: "They did not show how they checked your dispute when you asked.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "RESPONSE_INCOMPLETE",
                  desc: "Their reply to your letter left out important information.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "RESPONSE_NO_DOCUMENTATION",
                  desc: "They replied but did not send any proof.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "RESPONSE_ADDRESS_MISMATCH",
                  desc: "They sent their reply to the wrong address.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "RESPONSE_UNAUTHORIZED",
                  desc: "The reply came from the wrong company.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "PROCEDURAL_TIMING_VIOLATION",
                  desc: "They took too long to reply to your letter.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "FURNISHER_POST_DISPUTE_RETALIATION",
                  desc: "A company made your report look worse right after you disputed it.",
                  laws: ["PIPEDA 4.6"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group6">
            <AccordionTrigger>6. Collector Problems</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "COLLECTOR_LICENSE_FAILURE",
                  desc: "The collection agency might not have a license to operate in your province.",
                  laws: ["Provincial Laws"],
                },
                {
                  id: "COLLECTOR_DUPLICATE_REPORTING",
                  desc: "The same debt is showing up twice from different collectors.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
                  desc: "A collector tried to restart the clock on an old debt.",
                  laws: ["Provincial Laws"],
                },
                {
                  id: "MULTIPLE_COLLECTOR_VIOLATION",
                  desc: "More than one collector is trying to report the exact same debt.",
                  laws: ["PIPEDA 4.6"],
                },
                {
                  id: "PHANTOM_DEBT_UNVERIFIABLE",
                  desc: "This looks like a fake debt that cannot be proven.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.6.1"],
                },
                {
                  id: "ZOMBIE_DEBT_RESURRECTION",
                  desc: "An old debt that was already removed came back to life.",
                  laws: ["PIPEDA 4.6"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="group7">
            <AccordionTrigger>7. Cross-Bureau & Identity Issues</AccordionTrigger>
            <AccordionContent>
              {renderViolationCards([
                {
                  id: "CROSS_ENTITY_DISCREPANCY",
                  desc: "Different companies show different information for the same account.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.6.1"],
                },
                {
                  id: "CROSS_BUREAU_INCONSISTENCY",
                  desc: "Equifax and TransUnion show different details for this account.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.6.1"],
                },
                {
                  id: "IDENTITY_THEFT_VIOLATION",
                  desc: "There are signs that this account might belong to someone who stole your identity.",
                  laws: ["PIPEDA 4.3"],
                },
                {
                  id: "BANKRUPTCY_DISCHARGE_VIOLATION",
                  desc: "They are reporting a debt that was wiped out in your bankruptcy.",
                  laws: ["Bankruptcy Act", "PIPEDA 4.6"],
                },
                {
                  id: "FURNISHER_JOINT_ACCOUNT_VIOLATION",
                  desc: "A shared account is reported wrong, which might hurt you.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.3"],
                },
                {
                  id: "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION",
                  desc: "You are listed as owing this debt when you were only an authorized user.",
                  laws: ["PIPEDA 4.6", "PIPEDA 4.3"],
                },
                {
                  id: "DISCLOSURE_DEFICIENCY",
                  desc: "They failed to share required information with you.",
                  laws: ["Provincial Laws"],
                },
              ])}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      {/* SECTION 3 */}
      <KnowledgeBaseSection
        title="Provincial Laws by Province"
        icon={MapPin}
        badge="13 JURISDICTIONS"
        badgeVariant="info"
      >
        <p>
          Each province and territory has its own consumer protection and credit
          reporting rules. We suggest local references based on where you live and
          the finding context.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          {Object.entries(PROVINCIAL_CRA_MAPPING).map(([provCode, provData]) => {
            const sections = provData.sections as Record<string, string>;
            return (
              <AccordionItem key={provCode} value={`prov-${provCode}`}>
                <AccordionTrigger>
                  {provinceNames[provCode] || provCode} ({provData.statuteName})
                </AccordionTrigger>
                <AccordionContent>
                  <div className={styles.tableWrapper}>
                    <table className={styles.simpleTable}>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Section</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(sections).map(([key, value]) => (
                          <tr key={key}>
                            <td>
                              <strong>
                                {categoryLabels[key] ||
                                  key.charAt(0).toUpperCase() + key.slice(1)}
                              </strong>
                            </td>
                            <td>{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};
