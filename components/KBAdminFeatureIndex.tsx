import { Link } from "react-router-dom";
import { BookOpen, ListChecks, Map, Route } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import {
  adminKbFeatureGroups,
  platformFunctionGroups,
  type AdminKbFeatureCategory,
} from "../helpers/adminKnowledgeBaseContent";
import styles from "./KBAdminFeatureIndex.module.css";

const categoryLabels: Record<AdminKbFeatureCategory, string> = {
  Platform: "Platform",
  "Legal & Rules": "Legal & Rules",
  Tools: "Tools",
  Reference: "Reference",
};

const categoryBadgeVariants: Record<
  AdminKbFeatureCategory,
  "default" | "primary" | "success" | "error" | "warning" | "info"
> = {
  Platform: "primary",
  "Legal & Rules": "warning",
  Tools: "info",
  Reference: "default",
};

export const KBAdminFeatureIndex = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Complete Admin Function Index"
        icon={ListChecks}
        badge="ALL ADMIN FUNCTIONS"
        badgeVariant="primary"
      >
        <p>
          This index covers every admin-facing route, reference surface, and guarded
          administrative function documented for the current build.
        </p>
        <div className={styles.featureList}>
          {adminKbFeatureGroups.map((group) => (
            <div key={`${group.category}-${group.title}`} className={styles.featureItem}>
              <div className={styles.featureHeader}>
                <div className={styles.featureTitleGroup}>
                  <h3 className={styles.featureTitle}>{group.title}</h3>
                  <Badge
                    variant={categoryBadgeVariants[group.category]}
                    className={styles.categoryBadge}
                  >
                    {categoryLabels[group.category]}
                  </Badge>
                </div>
                {group.route && (
                  <Button asChild variant="outline" size="sm" className={styles.routeButton}>
                    <Link to={group.route}>
                      <Route size={14} />
                      Open
                    </Link>
                  </Button>
                )}
              </div>
              <p className={styles.featureSummary}>{group.summary}</p>
              <ul className={styles.functionList}>
                {group.functions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Platform Feature Catalog"
        icon={Map}
        badge="FULL PRODUCT"
        badgeVariant="info"
      >
        <p>
          Admins also need the full product map because support, triage, regulatory review,
          and release decisions depend on how user-facing and internal systems fit together.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          {platformFunctionGroups.map((group, index) => (
            <AccordionItem key={group.title} value={`platform-${index}`}>
              <AccordionTrigger>
                <span className={styles.platformTrigger}>
                  <BookOpen size={16} />
                  {group.title}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className={styles.platformIntro}>{group.intro}</p>
                <ul className={styles.functionList}>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};
