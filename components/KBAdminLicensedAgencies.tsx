import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { Building2, Search, ShieldCheck } from "lucide-react";
import styles from "./KBAdminLicensedAgencies.module.css";

export const KBAdminLicensedAgencies = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Viewing Licensed Agencies"
        icon={Search}
        badge="AGENCY LIST"
        badgeVariant="primary"
      >
        <p>
          The Licensed Agencies page allows you to view and manage collection agencies that are officially licensed to operate across different provinces.
        </p>
        <ul className={styles.list}>
          <li><strong>Search:</strong> Type an agency name in the search bar. The list will update as you type.</li>
          <li><strong>Filter by Province:</strong> Use the dropdown menu to show agencies from a specific province.</li>
        </ul>
        <p>
          Licensed agency data is available through the registry and API-backed collector review
          workflows. A dedicated admin route is not registered in this build.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="License Statuses"
        icon={ShieldCheck}
      >
        <p>
          Each agency has a status indicating their current standing with provincial authorities.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="statuses">
            <AccordionTrigger>Understanding statuses</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li>
                  <Badge variant="success" className={styles.inlineBadge}>Active</Badge> 
                  The agency is currently licensed and in good standing.
                </li>
                <li>
                  <Badge variant="warning" className={styles.inlineBadge}>Expired</Badge> 
                  The agency's license has lapsed.
                </li>
                <li>
                  <Badge variant="error" className={styles.inlineBadge}>Suspended / Revoked</Badge> 
                  The agency has lost their license to operate.
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Importing Data"
        icon={Building2}
        badge="DATA SYNC"
        badgeVariant="info"
      >
        <p>
          You can keep the system up to date by importing official provincial records.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="import">
            <AccordionTrigger>How to import Ontario data</AccordionTrigger>
            <AccordionContent>
              <ol className={styles.list}>
                <li>Go to the Licensed Agencies page.</li>
                <li>Click the <strong>Import Ontario Data</strong> button at the top.</li>
                <li>Wait for the import to complete. A success message will show how many agencies were imported or skipped.</li>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};
