import { Info, FileCode, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";
import { SourceReportParsedView } from "./SourceReportParsedView";
import styles from "./SourceReportTextView.module.css";

interface SourceReportTextViewProps {
  text: string | null | undefined;
}

export function SourceReportTextView({ text }: SourceReportTextViewProps) {
  if (!text) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.infoCard}>
          <div className={styles.iconWrapper}>
            <Info size={32} strokeWidth={1.5} />
          </div>
          <h3 className={styles.title}>Source text unavailable</h3>
          <div className={styles.messageBody}>
            <p>Source text highlighting is not available for this tradeline.</p>
            <p>
              This tradeline was imported before source text tracking was added.
            </p>
            <p>
              You can view the full source document in the{" "}
              <strong>PDF View</strong> tab.
            </p>
            <p className={styles.adminNote}>
              An admin can run the backfill process to populate source text for
              older tradelines.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Tabs defaultValue="parsed" className={styles.tabsContainer}>
        <div className={styles.header}>
          <TabsList>
            <TabsTrigger value="parsed">
              <FileCode size={14} style={{ marginRight: "0.5rem" }} />
              Parsed Data
            </TabsTrigger>
            <TabsTrigger value="raw">
              <FileText size={14} style={{ marginRight: "0.5rem" }} />
              Raw Text
            </TabsTrigger>
          </TabsList>
          <div className={styles.headerNote}>
            View extracted fields or original source text
          </div>
        </div>

        <div className={styles.contentArea}>
          <TabsContent value="parsed" className={styles.tabContent}>
            <SourceReportParsedView text={text} />
          </TabsContent>

          <TabsContent value="raw" className={styles.tabContent}>
            <div className={styles.rawTextContainer}>
              <div className={styles.notice}>
                This is the raw text extracted from the source document for this
                tradeline.
              </div>
              <div className={styles.textWrapper}>
                <pre className={styles.pre}>{text}</pre>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}