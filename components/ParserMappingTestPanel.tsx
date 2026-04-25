import React, { useState } from "react";
import { useTestParserMapping } from "../helpers/parserMappingQueries";
import { useToast } from "../helpers/useToast";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { ComprehensiveParseResult } from "../helpers/reportParserTypes";
import styles from "./ParserMappingTestPanel.module.css";

export const ParserMappingTestPanel = () => {
  const [htmlInput, setHtmlInput] = useState("");
  const { mutateAsync, isPending } = useTestParserMapping();
  const { showError, showSuccess } = useToast();

  const [testResult, setTestResult] = useState<{
    defaultResult: ComprehensiveParseResult;
    overriddenResult: ComprehensiveParseResult;
    detectedBureau: string;
  } | null>(null);

  const handleRunTest = async () => {
    if (!htmlInput.trim()) {
      showError("Please paste some HTML to test.");
      return;
    }
    
    setTestResult(null);

    try {
      const res = await mutateAsync({ html: htmlInput });
      setTestResult(res);
      showSuccess("Test completed successfully.");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Test failed");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputSection}>
        <div className={styles.header}>
          <h3 className={styles.title}>Test Ingestion Sandbox</h3>
          <Button onClick={handleRunTest} disabled={isPending || !htmlInput.trim()}>
            {isPending ? "Running..." : "Run Test"}
          </Button>
        </div>
        <Textarea
          className={styles.htmlTextarea}
          placeholder="Paste raw HTML credit report here..."
          value={htmlInput}
          onChange={(e) => setHtmlInput(e.target.value)}
        />
      </div>

      <div className={styles.resultsSection}>
        {isPending ? (
          <div className={styles.loadingGrid}>
            <div className={styles.loadingCol}>
              <Skeleton className={styles.skeletonTitle} />
              <Skeleton className={styles.skeletonBlock} />
            </div>
            <div className={styles.loadingCol}>
              <Skeleton className={styles.skeletonTitle} />
              <Skeleton className={styles.skeletonBlock} />
            </div>
          </div>
        ) : testResult ? (
          <div className={styles.resultsContent}>
            <div className={styles.resultsHeader}>
              <Badge variant="primary" className={styles.bureauBadge}>
                Detected Bureau: {testResult.detectedBureau}
              </Badge>
              <div className={styles.statsRow}>
                <span className={styles.statLabel}>Tradelines Found:</span>
                <span className={styles.statValue}>
                  {testResult.overriddenResult.tradelines.length}
                </span>
                <span className={styles.statLabel} style={{ marginLeft: '1rem' }}>Inquiries:</span>
                <span className={styles.statValue}>
                  {testResult.overriddenResult.inquiries.length}
                </span>
              </div>
            </div>

            <div className={styles.diffGrid}>
              <div className={styles.diffColumn}>
                <div className={styles.columnHeader}>
                  <h4>Factory Defaults</h4>
                  <Badge variant="default">Baseline</Badge>
                </div>
                <pre className={styles.jsonViewer}>
                  <code>{JSON.stringify(testResult.defaultResult, null, 2)}</code>
                </pre>
              </div>
              <div className={styles.diffColumn}>
                <div className={styles.columnHeader}>
                  <h4>With Overrides Applied</h4>
                  <Badge variant="success">Current Production</Badge>
                </div>
                <pre className={styles.jsonViewer}>
                  <code>{JSON.stringify(testResult.overriddenResult, null, 2)}</code>
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            Paste HTML and click "Run Test" to compare factory parser logic against your live overrides.
          </div>
        )}
      </div>
    </div>
  );
};