import React, { useState } from "react";
import { Download, Phone, Mail, ExternalLink, CheckCircle, ShieldCheck, ChevronDown } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";
import { toast } from "sonner";
import { useLeadReminder } from "../helpers/useLeadReminder";
import styles from "./CreditReportGuide.module.css";

interface CreditReportGuideProps {
  onSwitchToUpload: () => void;
  className?: string;
}

export function CreditReportGuide({ onSwitchToUpload, className = "" }: CreditReportGuideProps) {
  const [email, setEmail] = useState("");
  const [isReminderSet, setIsReminderSet] = useState(false);
  const [isPdfInfoOpen, setIsPdfInfoOpen] = useState(false);

  const reminderMutation = useLeadReminder();

  const handleReminderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    reminderMutation.mutate(
      { email },
      {
        onSuccess: () => {
          setIsReminderSet(true);
          toast.success("We'll send you one reminder email tomorrow.");
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        },
      }
    );
  };

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.introCard}>
        <p className={styles.introText}>
          Every Canadian can get their credit report for free — it's the law. It takes about 5 minutes online. You'll need the PDF version.
        </p>
      </div>

      <div className={styles.pdfInfoContainer}>
        <button 
          className={styles.pdfInfoToggle} 
          onClick={() => setIsPdfInfoOpen(!isPdfInfoOpen)}
          type="button"
          aria-expanded={isPdfInfoOpen}
        >
          <span>What's a PDF?</span>
          <ChevronDown 
            size={18} 
            className={`${styles.pdfInfoIcon} ${isPdfInfoOpen ? styles.pdfInfoIconOpen : ""}`} 
          />
        </button>
        {isPdfInfoOpen && (
          <div className={styles.pdfInfoContent}>
            <p>A PDF is a type of file — like a digital printout. It keeps your report looking the same no matter what device you open it on.</p>
            <p>Your credit report should download as a PDF file. The file name will end in .pdf</p>
            <div className={styles.cssFileIcon}>
              my-report.pdf
            </div>
            <p>If you're not sure, look for the file on your computer — it usually has a red and white icon.</p>
          </div>
        )}
      </div>

      <div className={styles.bureausGrid}>
        {/* Equifax Card */}
        <div className={styles.bureauCard}>
          <div className={styles.bureauHeader}>
            <ShieldCheck size={24} color="var(--primary)" />
            <h3 className={styles.bureauTitle}>Equifax Canada</h3>
          </div>
          
          <ul className={styles.methodList}>
            <li className={styles.methodItem}>
              <Download className={styles.methodIcon} size={18} />
              <div>
                <strong>Fastest:</strong> Online at{" "}
                <a href="https://my.equifax.ca/" target="_blank" rel="noopener noreferrer" className={styles.bureauLink}>
                  my.equifax.ca <ExternalLink size={14} />
                </a>
                <br />
                Create a myEquifax account and download the PDF.
                <ol className={styles.stepsList}>
                  <li>Go to my.equifax.ca and create a free account</li>
                  <li>Log in and find your credit report</li>
                  <li>Look for a "Download" or "Save as PDF" button</li>
                  <li>Save the file to your computer</li>
                </ol>
              </div>
            </li>
            <li className={styles.methodItem}>
              <Phone className={styles.methodIcon} size={18} />
              <div>
                <strong>Phone:</strong> 1-800-465-7166
                <br />
                (Mailed to you in 5–10 days)
              </div>
            </li>
          </ul>
          
          <div className={styles.tipBox}>
            <strong>Tip:</strong> Make sure to download or save your report as a PDF file.
          </div>
        </div>

        {/* TransUnion Card */}
        <div className={styles.bureauCard}>
          <div className={styles.bureauHeader}>
            <ShieldCheck size={24} color="var(--secondary)" />
            <h3 className={styles.bureauTitle}>TransUnion Canada</h3>
          </div>
          
          <ul className={styles.methodList}>
            <li className={styles.methodItem}>
              <Download className={styles.methodIcon} size={18} />
              <div>
                <strong>Fastest:</strong> Online at{" "}
                <a href="https://ocs.transunion.ca/" target="_blank" rel="noopener noreferrer" className={styles.bureauLink}>
                  ocs.transunion.ca <ExternalLink size={14} />
                </a>
                <br />
                Request your "Consumer Disclosure" and download the PDF.
                <ol className={styles.stepsList}>
                  <li>Go to ocs.transunion.ca</li>
                  <li>Answer the identity questions to verify who you are</li>
                  <li>Your report (called a "Consumer Disclosure") will appear</li>
                  <li>Look for a "Download PDF" button and save the file</li>
                </ol>
              </div>
            </li>
            <li className={styles.methodItem}>
              <Phone className={styles.methodIcon} size={18} />
              <div>
                <strong>Phone:</strong> 1-800-663-9980
              </div>
            </li>
            <li className={styles.methodItem}>
              <Mail className={styles.methodIcon} size={18} />
              <div>
                <strong>Mail:</strong> TransUnion Consumer Relations, P.O. Box 338, LCD1, Hamilton, ON L8L 7W2
              </div>
            </li>
          </ul>
          
          <div className={styles.tipBox}>
            <strong>Tip:</strong> Make sure to download or save your report as a PDF file.
          </div>
        </div>
      </div>

      <div className={styles.actionSection}>
        <h3 className={styles.actionTitle}>What to do next</h3>
        <p>Once you download the PDF, come back here and upload it.</p>
        <Button 
          size="lg" 
          onClick={onSwitchToUpload}
          className={styles.actionButton}
        >
          I Have My Report — Upload Now
        </Button>

        <div className={styles.reminderSection}>
          {isReminderSet ? (
            <div className={styles.successMessage}>
              <CheckCircle size={20} />
              <span>Reminder set for tomorrow!</span>
            </div>
          ) : (
            <>
              <h4 className={styles.reminderTitle}>Not ready yet? We'll remind you.</h4>
              <form onSubmit={handleReminderSubmit} className={styles.reminderForm}>
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={reminderMutation.isPending}
                  className={styles.reminderInput}
                  required
                />
                <Button 
                  type="submit" 
                  variant="secondary"
                  disabled={reminderMutation.isPending}
                >
                  {reminderMutation.isPending ? "Setting..." : "Send Me a Reminder"}
                </Button>
              </form>
              <p className={styles.reminderNote}>We'll only email you once to remind you.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}