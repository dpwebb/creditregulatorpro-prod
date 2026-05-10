import { useState } from "react";
import { Copy, Check, Terminal, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./Accordion";
import { Button } from "./Button";
import { Badge } from "./Badge";
import styles from "./DataRetentionAutomation.module.css";

const WEBHOOK_URL = "https://creditregulatorpro.com/_api/retention/auto-purge";
const CRON_SCHEDULE = "0 2 * * *";

export const DataRetentionAutomation = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    setCopied(true);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <Terminal size={18} />
          <h3 className={styles.title}>Automated Enforcement</h3>
        </div>
        <Badge variant="info">Webhook Available</Badge>
      </div>

      <div className={styles.urlSection}>
        <label className={styles.label}>Webhook URL</label>
        <div className={styles.inputWrapper}>
          <code className={styles.urlDisplay}>{WEBHOOK_URL}</code>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleCopy}
            className={styles.copyButton}
            aria-label="Copy retention webhook URL"
            title="Copy URL"
          >
            {copied ? <Check size={14} className={styles.successIcon} /> : <Copy size={14} />}
          </Button>
        </div>
        <p className={styles.helperText}>
          Secure endpoint for triggering retention policies via external schedulers.
        </p>
      </div>

      <Accordion type="single" collapsible className={styles.accordion}>
        <AccordionItem value="instructions">
          <AccordionTrigger>Setup Instructions</AccordionTrigger>
          <AccordionContent>
            <div className={styles.instructions}>
              <div className={styles.step}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Prepare Authentication</p>
                  <p className={styles.stepText}>
                    The endpoint requires a Bearer token derived from your system's JWT Secret.
                  </p>
                  <div className={styles.codeBlock}>
                    Authorization: Bearer YOUR_JWT_SECRET_FIRST_32_CHARS
                  </div>
                </div>
              </div>

              <div className={styles.step}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Configure Scheduler</p>
                  <p className={styles.stepText}>
                    Use a service like GitHub Actions, cron-job.org, or standard crontab.
                    <br />
                    <strong>Recommended Schedule:</strong> Daily at 2:00 AM
                  </p>
                  <div className={styles.codeBlock}>
                    {CRON_SCHEDULE}
                  </div>
                </div>
              </div>

              <div className={styles.step}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Example Request (cURL)</p>
                  <div className={styles.codeBlock}>
                    curl -X POST \{'\n'}
                    &nbsp;&nbsp;{WEBHOOK_URL} \{'\n'}
                    &nbsp;&nbsp;-H "Authorization: Bearer [TOKEN]"
                  </div>
                </div>
              </div>

              <div className={styles.warningBox}>
                <ShieldAlert size={16} />
                <span>
                  Keep your authentication token secure. Do not expose it in client-side code.
                </span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
