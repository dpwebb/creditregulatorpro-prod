import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Spinner } from './Spinner';
import styles from './DeliveryWizard.module.css';

interface DeliveryWizardConfirmProps {
    crpReviewed: boolean;
    onCrpReviewedChange: (checked: boolean) => void;
    crpApproved: boolean;
    onCrpApprovedChange: (checked: boolean) => void;
    displayName: string;
    firstClassCost: number | null;
    isPricingLoading: boolean;
    isSigPending: boolean;
    hasSignature: boolean;
    crpError: string | null;
    isPending: boolean;
    onPay: () => void;
    onBack: () => void;
}

export const DeliveryWizardConfirm: React.FC<DeliveryWizardConfirmProps> = ({
    crpReviewed,
    onCrpReviewedChange,
    crpApproved,
    onCrpApprovedChange,
    displayName,
    firstClassCost,
    isPricingLoading,
    isSigPending,
    hasSignature,
    crpError,
    isPending,
    onPay,
    onBack,
}) => {
    return (
        <div className={styles.stepContent}>
            <div className={styles.summaryBox}>
                <p className={styles.summaryText}>
                    We will print and mail your approved letter to <strong>{displayName}</strong> as a mailing service.
                </p>
                <div className={styles.costBox}>
                    {isPricingLoading ? (
                        <Spinner size="sm" />
                    ) : (
                        <> 
                            <span className={styles.costAmount}> ${(firstClassCost ?? 0).toFixed(2)} CAD </span>
                            <span className={styles.costLabel}>This is what it costs.</span>
                        </>
                    )}
                </div>
            </div>
            {isSigPending ? (
                <div className={styles.loadingBox}>
                    <Spinner size="md" />
                    <p>Checking signature...</p>
                </div>
            ) : !hasSignature ? (
                <div className={styles.alertBox}>
                    <AlertCircle className={styles.alertIcon} />
                    <div className={styles.alertContent}>
                        <p className={styles.alertTitle}>We need your signature first</p>
                        <p className={styles.alertDesc}> We cannot mail the letter without your signature.</p>
                        <Button asChild variant="outline" className={styles.alertAction}>
                            <Link to="/my-info?tab=profile">Go to Profile</Link>
                        </Button>
                    </div>
                </div>
            ) : crpError ? (
                <div className={styles.errorBox}>
                    <AlertCircle className={styles.errorIcon} />
                    <div className={styles.errorContent}>
                        <p className={styles.errorTitle}>We hit a snag</p>
                        <p className={styles.errorDesc}>{crpError}</p>
                    </div>
                </div>
            ) : (
                <div className={styles.confirmBox}>
                    <div className={styles.checkboxGroup}>
                        <div className={styles.checkboxRow}>
                            <Checkbox id="crp-reviewed" checked={crpReviewed} onChange={(e) => onCrpReviewedChange(e.target.checked)} />
                            <label htmlFor="crp-reviewed"> I checked this letter and it looks right.</label>
                        </div>
                        <div className={styles.checkboxRow}>
                            <Checkbox id="crp-approved" checked={crpApproved} onChange={(e) => onCrpApprovedChange(e.target.checked)} />
                            <label htmlFor="crp-approved"> Everything in this letter is true, and I understand Credit Regulator Pro does not represent me.</label>
                        </div>
                    </div>
                    <Button size="lg" className={styles.primaryAction} disabled={!crpReviewed || !crpApproved || isPending} onClick={onPay}>
                        {isPending ? <Spinner size="sm" /> : 'Pay & Send'}
                    </Button>
                </div>
            )}
            <Button variant="ghost" className={styles.backButton} onClick={onBack}>
                <ChevronLeft size={16} /> Back
            </Button>
        </div>
    );
};

export default DeliveryWizardConfirm;
