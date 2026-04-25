import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./Dialog";
import { Button } from "./Button";
import styles from "./TermsDialog.module.css";

export interface TermsDialogProps {
  /** Controlled open state of the dialog */
  open?: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange?: (open: boolean) => void;
}

export const TermsDialog: React.FC<TermsDialogProps> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Credit Regulator Pro Terms of Use</DialogTitle>
          <DialogDescription>
            Please read these rules before using Credit Regulator Pro.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.scrollArea}>
          <section className={styles.section}>
            <h3 className={styles.heading}>1. Facilitation Only</h3>
            <p className={styles.text}>
              Credit Regulator Pro is a software facilitation platform, not a law firm or a legal representative. The tools provided are for organizational and generation purposes only.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>2. No Representation</h3>
            <p className={styles.text}>
              The consumer acts as the sole disputing party. Credit Regulator Pro does not represent you in any capacity before credit bureaus, furnishers, or courts.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>3. User Control</h3>
            <p className={styles.text}>
              The consumer reviews, approves, and directly controls all transmissions. You are responsible for verifying the accuracy of all generated dispute materials before submission.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>4. Data Consent (PIPEDA)</h3>
            <p className={styles.text}>
              In accordance with PIPEDA, Credit Regulator Pro collects, uses, and discloses personal information solely to organize, generate, and facilitate dispute materials at the consumer's explicit direction.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>5. Transmission at User Direction</h3>
            <p className={styles.text}>
              Credit Regulator Pro transmits only the information and documents that the consumer has explicitly reviewed and approved for delivery.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>6. No Guarantees</h3>
            <p className={styles.text}>
              Credit Regulator Pro provides no guarantee of any specific outcome. Credit reporting agencies and creditors make their own independent determinations regarding disputes.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>7. Liability Limitations</h3>
            <p className={styles.text}>
              Credit Regulator Pro is not liable for any responses, actions, or inactions by credit bureaus, data furnishers, or creditors resulting from the use of our platform.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>8. Indemnification</h3>
            <p className={styles.text}>
              The user agrees to indemnify and hold harmless Credit Regulator Pro, its officers, and employees from any claims, damages, or legal actions arising from the user's utilization of the platform.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>9. Acceptable Use</h3>
            <p className={styles.text}>
              Users agree not to submit or facilitate the submission of any false, fraudulent, or materially inaccurate information through the platform.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>10. Governing Law</h3>
            <p className={styles.text}>
              These Terms of Use are governed by the laws of Canada. Any disputes arising from these terms shall be resolved under Canadian jurisdiction.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.heading}>11. Contact Information</h3>
            <p className={styles.text}>
              If you have any questions about these Terms, please contact us at support@creditregulatorpro.com.
            </p>
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="primary">I understand</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};