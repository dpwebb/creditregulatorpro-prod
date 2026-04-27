import React from 'react';
import { ChevronLeft, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './Button';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { getPacketPdfUrl } from '../endpoints/packet/pdf_GET.schema';
import { getBureauDisputeAddress } from '../helpers/bureauDisputeAddresses';
import { PDF_WORKER_URL } from '../helpers/pdfWorker';
import styles from './DeliveryWizard.module.css';

interface DeliveryWizardStepProps {
    packetId: number;
    bureauName: string;
    zoomLevel: number;
    onZoomChange: (level: number) => void;
    onContinue: () => void;
    onBack: () => void;
    initialStep?: string;
}

export const DeliveryWizardStep: React.FC<DeliveryWizardStepProps> = ({
    packetId,
    bureauName,
    zoomLevel,
    onZoomChange,
    onContinue,
    onBack,
    initialStep = 'choose',
}) => {
    const bureauAddress = getBureauDisputeAddress(bureauName);

    return (
        <div className={styles.stepContent}>
            <div className={styles.destinationBox}>
                <p className={styles.destinationHeading}>This letter will be sent to:</p>
                {bureauAddress ? (
                    <div className={styles.destinationAddress}>
                        <p className={styles.destinationName}>{bureauAddress.bureauName}</p>
                        <p>{bureauAddress.department}</p>
                        <p>{bureauAddress.addressLine1}</p>
                        <p>{bureauAddress.city}, {bureauAddress.province} {bureauAddress.postalCode}</p>
                    </div>
                ) : (
                    <>  
                        <p className={styles.destinationName}>{bureauName}</p>
                        <p className={styles.destinationNote}>The full address is on your letter.</p>
                    </>
                )}
                <div className={styles.destinationWrong}>
                    <p>Wrong address? You will need to create a new letter.</p>
                </div>
            </div>
            <div className={styles.pdfViewerWrapper}>
                <div className={styles.zoomToolbar}>
                    <Button variant="outline" size="sm" onClick={() => onZoomChange(Math.max(0.5, zoomLevel - 0.25))} disabled={zoomLevel <= 0.5} aria-label="Zoom out">
                        <ZoomOut size={16} />
                    </Button>
                    <span className={styles.zoomText}>{Math.round(zoomLevel * 100)}%</span>
                    <Button variant="outline" size="sm" onClick={() => onZoomChange(Math.min(3.0, zoomLevel + 0.25))} disabled={zoomLevel >= 3.0} aria-label="Zoom in">
                        <ZoomIn size={16} />
                    </Button>
                </div>
                <div className={styles.pdfContainer}>
                    <Worker workerUrl={PDF_WORKER_URL}>
                        <Viewer key={`pdf-zoom-${zoomLevel}`} fileUrl={getPacketPdfUrl({ packetId })} defaultScale={zoomLevel} />
                    </Worker>
                </div>
            </div>
            <Button size="lg" className={styles.primaryAction} onClick={onContinue}>
                This looks right — continue
            </Button>
            {initialStep === 'choose' && (
                <Button variant="ghost" className={styles.backButton} onClick={onBack}>
                    <ChevronLeft size={16} /> Back
                </Button>
            )}
        </div>
    );
};

export default DeliveryWizardStep;
