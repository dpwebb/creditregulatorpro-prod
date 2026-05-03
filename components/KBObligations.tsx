import { Link } from "react-router-dom";
import { Scale, BookOpen, Gavel, ShieldAlert, ArrowDown, Target } from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { KBObligationsSuccessMetrics } from "./KBObligationsSuccessMetrics";
import { KBObligationsVectorProgression } from "./KBObligationsVectorProgression";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./Sheet";
import { Button } from "./Button";
import { AutoEscalationSetupGuide } from "../helpers/autoEscalationSetup";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import styles from "./KBObligations.module.css";

export const KBObligations = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        id="adversarial-vectors"
        title="7 Ways to Challenge Errors"
        icon={Target}
        badge="Procedural Challenge"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro gives you 7 ways to challenge an account. These ways focus on the rules they broke, without ever saying the debt is yours. They force the company to show proof they often do not have.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="vector-list">
            <AccordionTrigger>Complete List with Legal Rules</AccordionTrigger>
            <AccordionContent>
              <div className={styles.vectorList}>
                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">1</Badge>
                    <h4>Right to Report</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Show you have the legal right to report this account"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Data Furnisher Agreement / Reporting Rules
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">2</Badge>
                    <h4>Valid Reason</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Show you have a valid reason to look at or report my file"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Privacy Laws — Valid reason to check credit
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">3</Badge>
                    <h4>How They Checked</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Tell me exactly how you checked my disputed information"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Consumer Laws — Method of checking facts
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">4</Badge>
                    <h4>Complete Information</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Swear that all the details you reported are complete"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Consumer Laws — Complete information rules
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">5</Badge>
                    <h4>Accurate Information</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Show proof that your information is perfectly accurate"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Consumer Laws — Maximum accuracy rules
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">6</Badge>
                    <h4>Missed Deadlines</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Show you followed the legal time limits"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Consumer Laws — 30-day investigation limit
                  </p>
                </div>

                <div className={styles.vectorItem}>
                  <div className={styles.vectorHeader}>
                    <Badge variant="default">7</Badge>
                    <h4>How They Investigated</h4>
                  </div>
                  <p className={styles.vectorDescription}>
                    "Explain exactly how you investigated my claim"
                  </p>
                  <p className={styles.vectorBasis}>
                    <strong>Law:</strong> Consumer Laws — Investigation duties
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="auto-request-generation">
            <AccordionTrigger>Making Requests Automatically</AccordionTrigger>
            <AccordionContent>
              <p>
                The system turns the errors it finds into clear, legal requests for information.
              </p>
              
              <h4>How it works</h4>
              <div className={styles.workflowSteps}>
                <div className={styles.workflowStep}>
                  <Badge variant="error">1. Find</Badge>
                  <span>Find an error (like an old debt)</span>
                </div>
                <ArrowDown size={16} className={styles.vectorArrow} />
                <div className={styles.workflowStep}>
                  <Badge variant="primary">2. Map</Badge>
                  <span>Make the right legal request</span>
                </div>
                <ArrowDown size={16} className={styles.vectorArrow} />
                <div className={styles.workflowStep}>
                  <Badge variant="warning">3. Track</Badge>
                  <span>Watch for their answer</span>
                </div>
                <ArrowDown size={16} className={styles.vectorArrow} />
                <div className={styles.workflowStep}>
                  <Badge variant="success">4. Score</Badge>
                  <span>Score how well they followed the law</span>
                </div>
              </div>

              <div className={styles.exampleBox}>
                <h4>Example: Old Debt Error</h4>
                <p>When a debt is too old to report, the system asks for:</p>
                <ul>
                  <li><strong>Legal Proof:</strong> Asking them to cite the exact law.</li>
                  <li><strong>Date Proof:</strong> Asking for original records of the first late date.</li>
                  <li><strong>Payment Proof:</strong> Asking for proof of any recent payments.</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="rotation-strategy"
        title="Step-by-Step Challenge Plan"
        icon={Scale}
        badge="Systematic"
        badgeVariant="info"
      >
        <p>
          The plan goes through 4 steps to use every legal option you have.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="sequences">
            <AccordionTrigger>Complete Sequence Breakdown</AccordionTrigger>
            <AccordionContent>
              <div className={styles.sequenceFlow}>
                <div className={styles.sequenceCard}>
                  <div className={styles.sequenceHeader}>
                    <Badge variant="primary">Step 1</Badge>
                    <h4>The Basics</h4>
                  </div>
                  <div className={styles.sequenceVectors}>
                    <span>→ Right to Report</span>
                    <span>→ Valid Reason</span>
                  </div>
                  <p>Challenges their basic right to report this information.</p>
                </div>

                <div className={styles.sequenceCard}>
                  <div className={styles.sequenceHeader}>
                    <Badge variant="primary">Step 2</Badge>
                    <h4>The Process</h4>
                  </div>
                  <div className={styles.sequenceVectors}>
                    <span>→ How They Checked</span>
                    <span>→ Complete Information</span>
                  </div>
                  <p>Asks them to prove how they check their facts.</p>
                </div>

                <div className={styles.sequenceCard}>
                  <div className={styles.sequenceHeader}>
                    <Badge variant="primary">Step 3</Badge>
                    <h4>The Details</h4>
                  </div>
                  <div className={styles.sequenceVectors}>
                    <span>→ Accurate Information</span>
                    <span>→ How They Investigated</span>
                  </div>
                  <p>Forces them to swear their facts are perfect.</p>
                </div>

                <div className={styles.sequenceCard}>
                  <div className={styles.sequenceHeader}>
                    <Badge variant="error">Step 4</Badge>
                    <h4>Final Steps</h4>
                  </div>
                  <div className={styles.sequenceVectors}>
                    <span>→ Missed Deadlines</span>
                  </div>
                  <p>Documents all the deadlines they missed.</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="deficiency-detection">
            <AccordionTrigger>Checking Their Answers</AccordionTrigger>
            <AccordionContent>
              <p>
                The system reads their replies to see if they gave a weak answer. If they did, it moves you to the next step:
              </p>
              <div className={styles.deficiencyList}>
                <div className={styles.deficiencyCard}>
                  <h4>Generic Answers</h4>
                  <ul>
                    <li>"verified as accurate"</li>
                    <li>"account information matches"</li>
                    <li>"confirmed with creditor"</li>
                  </ul>
                  <p>They just say 'it is correct' without giving proof.</p>
                </div>

                <div className={styles.deficiencyCard}>
                  <h4>Dismissive Language</h4>
                  <ul>
                    <li>"frivolous"</li>
                    <li>"irrelevant"</li>
                    <li>"previously investigated"</li>
                  </ul>
                  <p>They call your letter 'frivolous' or ignore it.</p>
                </div>

                <div className={styles.deficiencyCard}>
                  <h4>Missing Proof</h4>
                  <ul>
                    <li>"unable to provide"</li>
                    <li>"proprietary information"</li>
                    <li>"policy prohibits"</li>
                  </ul>
                  <p>They say they 'cannot provide' the proof you asked for.</p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="obligations-overview"
        title="How a Challenge Moves Forward"
        icon={Gavel}
      >
        <p>
          A challenge moves through several stages. Understanding these stages is important to know what happens next.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="obligation-lifecycle">
            <AccordionTrigger>All Stages</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.lifecycleSteps}>
                <li>
                  <Badge variant="info">WAITING</Badge>
                  <span>
                    Error found, but no letter sent yet.
                  </span>
                </li>
                <li>
                  <Badge variant="warning">CHALLENGED</Badge>
                  <span>
                    Letter sent. Waiting for their reply.
                  </span>
                </li>
                <li>
                  <Badge variant="error">NO REPLY</Badge>
                  <span>
                    They missed the deadline to reply.
                  </span>
                </li>
                <li>
                  <Badge variant="warning">WEAK REPLY</Badge>
                  <span>
                    They replied, but did not give the proof we asked for.
                  </span>
                </li>
                <li>
                  <Badge variant="error">READY FOR NEXT STEPS</Badge>
                  <span>
                    All 4 steps are done. Time for a formal complaint or legal action.
                  </span>
                </li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="obligation-types">
            <AccordionTrigger>Who Follows Rules</AccordionTrigger>
            <AccordionContent>
              <p>We check rules for three types of companies:</p>
              <ul>
                <li>
                  <strong>Creditors:</strong> The original lender (like a bank).
                </li>
                <li>
                  <strong>Bureaus:</strong> Equifax and TransUnion. They must investigate in 30 days.
                </li>
                <li>
                  <strong>Collectors:</strong> Third-party debt collectors. They must:
                  <ul className={styles.subList}>
                    <li>Prove you owe the debt.</li>
                    <li>Show who originally owned the debt.</li>
                    <li>Follow the time limits for old debts (2 to 6 years).</li>
                    <li>Send a letter before reporting to a bureau.</li>
                  </ul>
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="enforcement"
        title="Enforcement Mechanisms"
        icon={Gavel}
      >
        <p>
          When a rule is broken, we take action. This is called an enforcement mechanism.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="mechanisms">
            <AccordionTrigger>Types of Action</AccordionTrigger>
            <AccordionContent>
              <ul>
                <li>
                  <strong>Complaint Procedure:</strong> Filing a formal complaint with the government.
                </li>
                <li>
                  <strong>Enforcing Body:</strong> Sending the issue to an ombudsman or privacy commissioner.
                </li>
                <li>
                  <strong>Penalty:</strong> Financial penalties defined by law for breaking the rules.
                </li>
              </ul>
              <p>
                Manage these in the{" "}
                <Link to="/enforcement-mechanisms">
                  Enforcement Mechanisms
                </Link>{" "}
                page.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="analytics"
        title="Analytics & Success Tracking"
        icon={BookOpen}
        badge="Performance"
      >
        <KBObligationsSuccessMetrics />
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="auto-escalation"
        title="Auto-Escalation System"
        icon={ShieldAlert}
      >
        <p>
          Our system makes sure no broken rule is ignored. It automatically moves to the next step if they miss a deadline.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="how-it-works">
            <AccordionTrigger>How It Works</AccordionTrigger>
            <AccordionContent>
              <p>
                The system checks regularly for challenges where:
              </p>
              <ul className={styles.checkList}>
                <li>The deadline to reply has passed (usually 30 days plus mailing time).</li>
                <li>No reply has been saved from the company.</li>
                <li>The challenge has not already been moved forward.</li>
              </ul>
              <p>
                If these are true, the system moves you to the next step in the plan.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="vector-progression">
            <AccordionTrigger>Challenge Progression</AccordionTrigger>
            <AccordionContent>
              <KBObligationsVectorProgression />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="scheduling">
            <AccordionTrigger>Setting Up Automatic Scheduling</AccordionTrigger>
            <AccordionContent>
              <p>
                Administrators can set the system to run these checks automatically.
              </p>
              <div className={styles.setupAction}>
                <p>
                  To set up automatic scheduling, follow the guide below.
                </p>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline">View Setup Guide</Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Auto-Escalation Setup</SheetTitle>
                      <SheetDescription>
                        Configuration details for automatic checks.
                      </SheetDescription>
                    </SheetHeader>
                    <div className={styles.sheetBody}>
                      <AutoEscalationSetupGuide />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};