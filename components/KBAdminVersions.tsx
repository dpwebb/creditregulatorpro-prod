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
import { GitMerge, Database, ToggleRight } from "lucide-react";
import styles from "./KBAdminVersions.module.css";

export const KBAdminVersions = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Version Management"
        icon={GitMerge}
        badge="RELEASES"
        badgeVariant="primary"
      >
        <p>
          The Version Management page is where you track the software changes. 
          You can see what new features were added and when they were released.
        </p>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-version-management">Go to Version Management</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Releases & Versions"
        icon={GitMerge}
      >
        <p>
          Every major update to the app gets a version number. 
          You can see a list of all versions in the app history.
        </p>
        <ul className={styles.list}>
          <li><strong>Draft:</strong> A version being worked on.</li>
          <li><strong>Released:</strong> The version currently live for users.</li>
          <li><strong>Archived:</strong> Old versions that are no longer used.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Database Migrations"
        icon={Database}
        badge="TECHNICAL"
        badgeVariant="warning"
      >
        <p>
          Sometimes the app needs to change how it stores data. 
          These changes are called database migrations.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="migrations">
            <AccordionTrigger>Managing Migrations</AccordionTrigger>
            <AccordionContent>
              <p>
                In the Migrations tab, you can see all database changes.
                You can see if a change was applied safely. 
                If something breaks, a developer can use this info to fix it.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Feature Flags"
        icon={ToggleRight}
        badge="CONTROL"
        badgeVariant="info"
      >
        <p>
          A feature flag is like a light switch for a new feature. 
          You can turn a feature on or off without writing any code.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="flags">
            <AccordionTrigger>How to use feature flags</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Testing:</strong> Turn a feature on for admins only to test it safely.</li>
                <li><strong>Rollout:</strong> Turn a feature on for everyone when it is ready.</li>
                <li><strong>Emergency Off:</strong> If a feature breaks, turn the flag off quickly to hide it from users.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};