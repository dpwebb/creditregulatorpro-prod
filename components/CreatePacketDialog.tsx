import React, { useEffect, useMemo, useState, useRef } from "react";
import { z } from "zod";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "./Form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./Dialog";
import { useCreatePacket } from "../helpers/packetQueries";
import { useTradelineList } from "../helpers/tradelineQueries";
import { useComplianceViolations } from "../helpers/complianceViolationQueries";
import { usePacketRecommendations } from "../helpers/packetRecommendQueries";
import { getDisputeVectorSuggestion } from "../helpers/violationToDisputeVector";
import { getAccessPointById, mapAccessPointToDisputeReasonCode } from "../helpers/challengeAccessPointGenerator";
import { 
  EQUIFAX_DISPUTE_REASONS, 
  mapViolationToDisputeReason, 
  getDisputeReasonDescription, 
  type EquifaxDisputeReasonCode 
} from "../helpers/equifaxDisputeReasons";


import { PacketCreateError } from "../endpoints/packet/create_POST.schema";
import { useToast } from "../helpers/useToast";
import { CreatePacketRecommendStep } from "./CreatePacketRecommendStep";
import { CreatePacketFormStep } from "./CreatePacketFormStep";
import type { ThirdPartyRecipientValues } from "./ThirdPartyRecipientForm";
import { Spinner } from "./Spinner";
import { postPacketCreate } from "../endpoints/packet/create_POST.schema";
import styles from "./CreatePacketDialog.module.css";

function getConsumerFriendlyViolationCategory(category: string | null | undefined): string {
  if (!category) return "Compliance issue detected";
  
  if (category === "TEMPORAL_MANIPULATION" || category === "FURNISHER_REAGING_VIOLATION") return "Date reporting issue detected";
  if (category === "BALANCE_CALCULATION_VIOLATION" || category === "CREDIT_LIMIT_MANIPULATION") return "Balance or amount discrepancy detected";
  if (category === "CROSS_ENTITY_DISCREPANCY" || category === "CROSS_BUREAU_INCONSISTENCY") return "Inconsistency found between bureaus";
  if (category === "DOCUMENTATION_CHAIN_FAILURE" || category === "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION") return "Missing ownership documentation";
  if (category === "STATUTE_OF_LIMITATIONS" || category === "COLLECTOR_STATUTE_REVIVAL_ATTEMPT") return "Possible expired reporting period";
  if (category === "PROCEDURAL_TIMING_VIOLATION" || category === "BUREAU_INVESTIGATION_FAILURE" || category === "BUREAU_NOTIFICATION_FAILURE" || category.startsWith("RESPONSE_") || category.includes("RESPONSE_QUALITY")) return "Bureau procedure issue detected";
  if (category === "IDENTITY_THEFT_VIOLATION" || category === "BUREAU_ACCESS_VIOLATION") return "Unauthorized account activity detected";
  if (category === "ACCOUNT_STATUS_INCONSISTENCY" || category === "FURNISHER_STATUS_CODE_MISMATCH" || category === "BUREAU_DISPUTE_MARKING_FAILURE" || category === "FURNISHER_JOINT_ACCOUNT_VIOLATION" || category === "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION") return "Account status reporting error";
  if (category === "METRO2_FIELD_VIOLATIONS" || category === "METRO2_RULESET_VIOLATIONS") return "Technical reporting format error";
  if (category.startsWith("COLLECTOR_") || category === "MULTIPLE_COLLECTOR_VIOLATION") return "Collection agency issue detected";
  
  return "Compliance issue detected";
}

const createPacketSchema = z.object({
  bureauId: z.number().optional(),
  tradelineId: z.number().min(1, "Tradeline is required"),
  status: z.string().min(1, "Status is required"),
    content: z.string().optional(),
  disputeVector: z.string().optional(),
  disputeReasonCode: z.string().optional(),
  disputeBoth: z.boolean().optional(),
});

interface CreatePacketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPacketCreated?: (packetData: any) => void;
  
  // Autofill props
  autofillViolationId?: number;
  autofillTradelineId?: number;
  autofillBureauId?: number;
  challengeAccessPointId?: string;
  
  crossBureauTradelineId?: number | null;
  crossBureauBureauId?: number | null;
  crossBureauBureauName?: string | null;
  defaultDisputeBoth?: boolean;
}

export const CreatePacketDialog: React.FC<CreatePacketDialogProps> = ({ 
  open, 
  onOpenChange,
  onPacketCreated,
  autofillViolationId,
  autofillTradelineId,
  autofillBureauId,
  challengeAccessPointId,
  crossBureauTradelineId,
  crossBureauBureauId,
  crossBureauBureauName,
  defaultDisputeBoth
}) => {
  const [isPending, setIsPending] = useState(false);
  const { data: tradelineData } = useTradelineList();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const { data: recsData, isLoading: isLoadingRecs } = usePacketRecommendations();

  const [localViolationId, setLocalViolationId] = useState<number | undefined>(undefined);
  const [localTradelineId, setLocalTradelineId] = useState<number | undefined>(undefined);
  const [localBureauId, setLocalBureauId] = useState<number | undefined>(undefined);
  const [localViolationCategory, setLocalViolationCategory] = useState<string | null>(null);
  const [step, setStep] = useState<'recommend' | 'form' | 'auto-submit'>('recommend');
  const autoSubmitAttemptedRef = useRef(false);

  const activeViolationId = localViolationId || autofillViolationId;
  const activeTradelineId = localTradelineId || autofillTradelineId;
  const activeBureauId = localBureauId || autofillBureauId;
  const hasInitialAutofillProps = !!(autofillViolationId || autofillTradelineId || autofillBureauId || challengeAccessPointId);
  
  // If we have an activeTradelineId, we can fetch violations for context
  const { data: violationsData } = useComplianceViolations(activeTradelineId || 0);

  // Find the specific violation if autofill is active
  const autofillViolation = useMemo(() => {
    if (!activeViolationId || !violationsData?.obligationTests) return null;
    return violationsData.obligationTests.find(v => v.id === activeViolationId);
  }, [activeViolationId, violationsData]);

  const accessPoint = useMemo(() => {
    if (challengeAccessPointId && !autofillViolationId) {
      return getAccessPointById(challengeAccessPointId);
    }
    return null;
  }, [challengeAccessPointId, autofillViolationId]);

  const [suggestedVector, setSuggestedVector] = useState<{ vector: string | null; reason: string } | null>(null);
  
  // Track if we've already initialized for this dialog open session
  const initializedRef = useRef(false);

  const form = useForm({
    schema: createPacketSchema,
    defaultValues: {
      bureauId: 0,
      tradelineId: 0,
      status: "Draft",
      content: "",
      disputeVector: "",
      disputeReasonCode: "",
      disputeBoth: false,
    },
  });

  // Handle initialization and autofill logic
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      autoSubmitAttemptedRef.current = false;
      setStep('recommend');
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (hasInitialAutofillProps) {
        setStep('auto-submit');
      } else {
        setStep('recommend');
      }
      setLocalViolationId(undefined);
      setLocalTradelineId(undefined);
      setLocalBureauId(undefined);
      setLocalViolationCategory(null);

      if (autofillTradelineId && !autofillViolationId) {
        form.setValues({
          bureauId: autofillBureauId || 0,
          tradelineId: autofillTradelineId,
          status: "Draft",
          content: "",
          disputeVector: "",
          disputeReasonCode: challengeAccessPointId ? mapAccessPointToDisputeReasonCode(challengeAccessPointId) : "",
          disputeBoth: defaultDisputeBoth || false,
        });
        setSuggestedVector(null);
      } else if (!autofillViolationId && !autofillTradelineId) {
        form.setValues({
          bureauId: 0,
          tradelineId: 0,
          status: "Draft",
          content: "",
          disputeVector: "",
          disputeReasonCode: challengeAccessPointId ? mapAccessPointToDisputeReasonCode(challengeAccessPointId) : "",
          disputeBoth: defaultDisputeBoth || false,
        });
        setSuggestedVector(null);
      }
    }
  }, [open, autofillViolationId, autofillTradelineId, autofillBureauId, challengeAccessPointId, form, hasInitialAutofillProps, defaultDisputeBoth]);

  const doCreatePacket = async (payload: any, secondPayload?: any) => {
    setIsPending(true);
    try {
      const data1 = await postPacketCreate(payload);
      let data2 = null;
      let error2 = null;
      
      if (secondPayload) {
        try {
          data2 = await postPacketCreate(secondPayload);
        } catch (err) {
          error2 = err;
        }
      }
      
      onOpenChange(false);

      if (data1?.packet && onPacketCreated) {
        onPacketCreated(data1.packet); // Pass the first one for preview
      }

      if (secondPayload) {
        if (!error2) {
          showSuccess("Generated letters for both bureaus successfully.");
        } else {
                    showError("First letter generated, but failed to generate the second letter for the other bureau.", {
            description: (error2 as Error).message || "Unknown error occurred.",
          });
        }
      } else {
        showSuccess("Packet preview generated", {
          description: "You can review and save the packet.",
        });
      }
    } catch (error: any) {
      const errorMessage = error.message || "";
      
      let missingFields: string[] = [];
      
      if (error instanceof PacketCreateError && error.missingFields) {
        missingFields = error.missingFields;
      } else if ('missingFields' in error && Array.isArray((error as any).missingFields)) {
        missingFields = (error as any).missingFields;
      }
      
      if (errorMessage.includes("Incomplete consumer profile")) {
        const params = new URLSearchParams();
        params.set("returnTo", "createPacket");
        if (payload.tradelineId) params.set("tradelineId", String(payload.tradelineId));
        if (payload.bureauId) params.set("bureauId", String(payload.bureauId));
        if (payload.creditorObligationTestId) params.set("violationId", String(payload.creditorObligationTestId));
        
        if (missingFields.length > 0) {
          params.set("missingFields", missingFields.join(","));
        }

        const fieldList = missingFields.length > 0 
          ? `Missing: ${missingFields.map(f => f.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}`
          : "You must complete your profile (full name, address, city, province, postal code) before generating packets.";

        showError("Incomplete Profile", {
          description: fieldList,
          duration: 8000,
          action: {
            label: "Complete Profile",
            onClick: () => navigate(`/my-info?tab=profile&${params.toString()}`),
          }
        });
        onOpenChange(false);
      } else {
        showError("Failed to create packet", {
          description: errorMessage || "An unexpected error occurred while creating the packet."
        });
        setStep('form');
      }
    } finally {
      setIsPending(false);
    }
  };

  // A separate effect to handle autofill logic when activeViolationId changes and data is ready
  useEffect(() => {
    if (!open) return;

    if (step === 'form' && activeViolationId && autofillViolation && activeTradelineId) {
      // Calculate suggestions for the form display
      const suggestion = getDisputeVectorSuggestion({
        violationCategory: autofillViolation.violationCategory,
        recommendedAction: autofillViolation.recommendedAction,
        technicalDetails: autofillViolation.technicalDetails as { fieldName?: string } | null,
      });
      setSuggestedVector({ 
        vector: suggestion.vector, 
        reason: suggestion.reason 
      });

      const suggestedReasonCode = mapViolationToDisputeReason(
        autofillViolation.violationCategory,
        autofillViolation.technicalDetails as { fieldName?: string } | null
      );

      form.setValues(prev => ({
        ...prev,
        bureauId: activeBureauId || 0,
        tradelineId: activeTradelineId,
        status: "Draft",
        content: prev.content,
        disputeVector: suggestion.vector || "",
        disputeReasonCode: suggestedReasonCode || "",
      }));
    }

    // Auto-submit logic
    if (step === 'auto-submit' && !autoSubmitAttemptedRef.current) {
      if (activeViolationId) {
        if (!violationsData) return; // Wait for data to load
        
        if (!autofillViolation) {
          // If violation not found in data, fallback to form
          setStep('form');
          return;
        }

        const suggestedReasonCode = mapViolationToDisputeReason(
          autofillViolation.violationCategory,
          autofillViolation.technicalDetails as { fieldName?: string } | null
        );

        autoSubmitAttemptedRef.current = true;
        doCreatePacket({
          bureauId: activeBureauId || 0,
          tradelineId: activeTradelineId || 0,
          status: "Draft",
          content: null,
          creditorObligationTestId: activeViolationId,
          disputeReasonCode: suggestedReasonCode || null,
          violationCategory: autofillViolation.violationCategory || null,
          preview: true,
        });
        return;
      }

      if (challengeAccessPointId && activeTradelineId) {
        const code = mapAccessPointToDisputeReasonCode(challengeAccessPointId);
        autoSubmitAttemptedRef.current = true;
        doCreatePacket({
          bureauId: activeBureauId || 0,
          tradelineId: activeTradelineId,
          status: "Draft",
          content: null,
          creditorObligationTestId: null,
          disputeReasonCode: code || null,
          violationCategory: null,
          preview: true,
        });
        return;
      }
      
      if (activeTradelineId && activeBureauId) {
         autoSubmitAttemptedRef.current = true;
         doCreatePacket({
          bureauId: activeBureauId,
          tradelineId: activeTradelineId,
          status: "Draft",
          content: null,
          creditorObligationTestId: null,
          disputeReasonCode: null,
          violationCategory: null,
          preview: true,
        });
        return;
      }

      // If we don't have enough data to auto-submit, fallback to form
      setStep('form');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, activeViolationId, autofillViolation, activeTradelineId, activeBureauId, challengeAccessPointId, violationsData]);

  const handleSelectRecommendation = (rec: any) => {
    setLocalViolationId(rec.violationId);
    setLocalTradelineId(rec.tradelineId);
    setLocalBureauId(rec.bureauId);
    setLocalViolationCategory(rec.violationCategory || null);

    form.setValues((prev: any) => ({
      ...prev,
      bureauId: rec.bureauId || 0,
      tradelineId: rec.tradelineId,
      status: "Draft",
      disputeReasonCode: rec.suggestedReasonCode || "",
    }));

    setStep('form');
  };

  const onSubmit = (values: z.infer<typeof createPacketSchema>, thirdPartyData: ThirdPartyRecipientValues | null) => {
    if (!thirdPartyData && (!values.bureauId || values.bureauId < 1)) {
      form.setFieldError("bureauId", "Credit Bureau is required");
      return;
    }

    const payload1 = {
      bureauId: thirdPartyData ? undefined : values.bureauId,
      ...thirdPartyData,
      tradelineId: values.tradelineId,
      status: values.status,
      content: values.content || null,
      creditorObligationTestId: activeViolationId || null,
      disputeReasonCode: values.disputeReasonCode || null,
      violationCategory: autofillViolation?.violationCategory || localViolationCategory || null,
      preview: true,
    };
    
    let payload2 = undefined;
    if (values.disputeBoth && crossBureauTradelineId && crossBureauBureauId && !thirdPartyData) {
      payload2 = {
        ...payload1,
        bureauId: crossBureauBureauId,
        tradelineId: crossBureauTradelineId,
        // note: we drop violationId if it's specific to the current tradeline, but
        // creating generic dispute works without it.
        creditorObligationTestId: null, 
      };
    }

    doCreatePacket(payload1, payload2);
  };

  const isAutofillActive = !!activeViolationId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        {step === 'auto-submit' ? (
          <div className={styles.emptyState}>
            <Spinner size="lg" />
            <h3 className={styles.recsHeading}>Generating letter...</h3>
            <p className={styles.recsMessage}>Please wait while we automatically generate your dispute letter.</p>
          </div>
        ) : step === 'recommend' ? (
          <>
            <DialogHeader>
              <DialogTitle>Recommendations</DialogTitle>
              <DialogDescription>
                We analyzed your credit reports for compliance issues with mapped legal authority. Choose a recommendation to generate a dispute letter.
              </DialogDescription>
            </DialogHeader>
            <CreatePacketRecommendStep 
              isLoadingRecs={isLoadingRecs}
              recsData={recsData}
              isPending={isPending}
              creatingRecId={null}
              onSelectRecommendation={handleSelectRecommendation}
              onSkipToForm={() => setStep('form')}
              onSkipWithReset={() => {
                setLocalTradelineId(undefined);
                setLocalBureauId(undefined);
                setLocalViolationId(undefined);
                setLocalViolationCategory(null);
                form.setValues({
                  bureauId: 0,
                  tradelineId: 0,
                  status: "Draft",
                  content: "",
                  disputeVector: "",
                  disputeReasonCode: "",
                });
                setStep('form');
              }}
            />
          </>
        ) : (
          <>
          <CreatePacketFormStep
            form={form}
            onSubmit={onSubmit}
            isPending={isPending}
            activeBureauId={activeBureauId}
            activeTradelineId={activeTradelineId}
            hasInitialAutofillProps={hasInitialAutofillProps}
            isAutofillActive={isAutofillActive}
            autofillViolation={autofillViolation}
            accessPoint={accessPoint}
            tradelineData={tradelineData}
            onCancel={() => onOpenChange(false)}
            onBack={() => {
              setStep('recommend');
              setLocalTradelineId(undefined);
              setLocalBureauId(undefined);
              setLocalViolationId(undefined);
              setLocalViolationCategory(null);
            }}
            crossBureauTradelineId={crossBureauTradelineId}
            crossBureauBureauId={crossBureauBureauId}
            crossBureauBureauName={crossBureauBureauName}
          />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
