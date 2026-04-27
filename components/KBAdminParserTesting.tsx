import React from "react";
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
import { FileText, Play, CheckCircle, Download } from "lucide-react";
import styles from "./KBAdminParserTesting.module.css";

export const KBAdminParserTesting = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Parser Testing Environment"
        icon={FileText}
        badge="QA TOOLS"
        badgeVariant="primary"
      >
        <p>
          The parser is the tool that reads uploaded credit reports. 
          We must be sure it always reads the data correctly. 
          The Testing Environment lets you run tests to check its accuracy.
        </p>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-parser-testing">Go to Parser Testing</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Creating Test Cases"
        icon={FileText}
      >
        <p>
          A test case is a sample credit report and a list of what the parser should find in it.
        </p>
        <ul className={styles.list}>
          <li>Click <strong>New Test Case</strong> to start.</li>
          <li>Give it a clear name and description.</li>
          <li>Upload the sample PDF report.</li>
          <li>Save the expected data (like names, addresses, and account numbers).</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Running Tests"
        icon={Play}
        badge="ACTION"
        badgeVariant="warning"
      >
        <p>
          You can test the parser against your sample files to see if it makes any mistakes.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="run">
            <AccordionTrigger>How to run tests</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Single Test:</strong> Click the Run button next to one test case. You can see the detailed results right away.</li>
                <li><strong>Run All:</strong> Go to the "Run All Tests" tab. This runs every test at once. It gives you a summary of passes and fails. This is great for checking the whole system after an update.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Accepting Results"
        icon={CheckCircle}
        badge="UPDATE"
        badgeVariant="success"
      >
        <p>
          Sometimes the parser improves, or the credit bureaus change their report format. 
          If a test fails but you know the new result is actually correct, you can update the test.
        </p>
        <p>
          Click "Approve" on the new data. This saves the new data as the expected result for future tests.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Import and Export"
        icon={Download}
        badge="BACKUP"
        badgeVariant="info"
      >
        <p>
          You can share test cases with other developers or back them up.
        </p>
        <ul className={styles.list}>
          <li><strong>Export:</strong> Select test cases and download them as a file.</li>
          <li><strong>Import:</strong> Upload a file of test cases to add them to your list.</li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};