import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Form, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "./Form";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { Textarea } from "./Textarea";
import { Switch } from "./Switch";
import { BureauSelector } from "./BureauSelector";
import { HelpTooltip } from "./HelpTooltip";
import { ThirdPartyRecipientForm, ThirdPartyRecipientValues } from "./ThirdPartyRecipientForm";
import { EQUIFAX_DISPUTE_REASONS } from "../helpers/equifaxDisputeReasons";
import styles from "./CreatePacketFormStep.module.css";

export interface CreatePacketFormStepProps {
  form: any;
  onSubmit: (values: any, thirdPartyData: ThirdPartyRecipientValues | null) => void;
  isPending: boolean;
  activeBureauId?: number;
  activeTradelineId?: number;
  hasInitialAutofillProps: boolean;
  isAutofillActive: boolean;
  autofillViolation: any;
  accessPoint: any;
  tradelineData: any;
  onCancel: () => void;
  onBack: () => void;
  crossBureauTradelineId?: number | null;
  crossBureauBureauId?: number | null;
  crossBureauBureauName?: string | null;
}

export const CreatePacketFormStep: React.FC<CreatePacketFormStepProps> = ({
  form,
  onSubmit,
  isPending,
  activeBureauId,
  activeTradelineId,
  hasInitialAutofillProps,
  isAutofillActive,
  autofillViolation,
  accessPoint,
  tradelineData,
  onCancel,
  onBack,
  crossBureauTradelineId,
  crossBureauBureauId,
  crossBureauBureauName,
}) => {
  const [thirdPartyEnabled, setThirdPartyEnabled] = useState(false);
  const [thirdPartyValues, setThirdPartyValues] = useState<ThirdPartyRecipientValues>({
    recipientName: "",
    recipientAddressLine1: "",
    recipientAddressLine2: "",
    recipientCity: "",
    recipientProvince: "",
    recipientPostalCode: "",
  });

  const handleSubmit = (values: any) => {
    onSubmit(values, thirdPartyEnabled ? thirdPartyValues : null);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className={styles.formTitle}>
          {!hasInitialAutofillProps && (
            <Button 
              variant="ghost" 
              size="icon-sm" 
              onClick={onBack} 
              className={styles.backBtn}
            >
              <ArrowLeft size={16} />
            </Button>
          )}
          {isAutofillActive ? "Send a Dispute Letter" : "New Dispute Letter"}
        </DialogTitle>
        <DialogDescription>
          {isAutofillActive && autofillViolation
            ? "A formal dispute letter will be created and sent to the credit bureau on your behalf. You can add any personal notes below before submitting."
            : accessPoint
            ? `This is a formal procedural challenge. ${accessPoint.description}`
            : "Create a formal dispute letter to challenge information on your credit report. Select the bureau and account, then submit."
          }
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className={styles.form}>
                    <ThirdPartyRecipientForm
            enabled={thirdPartyEnabled}
            onEnabledChange={setThirdPartyEnabled}
            values={thirdPartyValues}
            onValuesChange={setThirdPartyValues}
          />

          {(!activeBureauId || !activeTradelineId) && (
            <div className={styles.row}>
              {!activeBureauId && !thirdPartyEnabled && (
                <FormItem name="bureauId" className={styles.halfWidth}>
                  <BureauSelector
                    value={form.values.bureauId || null}
                    onChange={(id) => {
                      form.setValues((prev: any) => ({...prev, bureauId: id || 0}));
                    }}
                    showAddress={false}
                    label="Send To"
                  />
                  <FormMessage />
                </FormItem>
              )}

              {!activeTradelineId && (
                <FormItem name="tradelineId" className={styles.halfWidth}>
                  <FormLabel>Account</FormLabel>
                  <FormControl>
                    <Select 
                      value={String(form.values.tradelineId)} 
                      onValueChange={(val) => form.setValues((prev: any) => ({...prev, tradelineId: parseInt(val)}))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {tradelineData?.tradelines.map((t: any) => {
                          const name = t.creditorName || t.originalCreditorName || "Unknown";
                          const lastFour = t.accountNumber?.slice(-4);
                          const suffix = lastFour ? ` (ending in ${lastFour})` : "";
                          return (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {name}{suffix} — {t.bureauName || "Unknown Bureau"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            </div>
          )}

          <div className={styles.row}>
            <FormItem name="status" className={styles.halfWidth}>
              <FormLabel>
                Status
                <HelpTooltip content="Draft means you can still make changes. Ready means it's done." />
              </FormLabel>
              <FormControl>
                <Select 
                  value={form.values.status} 
                  onValueChange={(val) => form.setValues((prev: any) => ({...prev, status: val}))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Ready">Ready</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          </div>

          {!isAutofillActive && (
            <div className={styles.row}>
              <FormItem name="disputeReasonCode" className={styles.halfWidth}>
                <FormLabel>
                  Why Are You Disputing?
                  <HelpTooltip content="Pick the main reason you think something is wrong." />
                </FormLabel>
              <FormControl>
                <Select 
                  value={form.values.disputeReasonCode || "_empty"} 
                  onValueChange={(val) => form.setValues((prev: any) => ({...prev, disputeReasonCode: val === "_empty" ? "" : val}))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EQUIFAX_DISPUTE_REASONS).map(([code, description]) => (
                      <SelectItem key={code} value={code}>{description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
            </div>
          )}

          <FormItem name="content">
            <FormLabel>
              Extra Notes (Optional)
              <HelpTooltip content={
                <div>
                  <p style={{marginBottom: '0.5rem'}}>The formal letter is created automatically. Use this space to add anything else you want to say.</p>
                </div>
              } />
            </FormLabel>
            <FormControl>
              <Textarea 
                placeholder="Any additional details you'd like to include in your dispute letter..." 
                value={form.values.content || ""} 
                onChange={e => form.setValues((prev: any) => ({...prev, content: e.target.value}))}
                rows={6}
                className={`${styles.textarea} ${isAutofillActive ? styles.highlightedInput : ''}`}
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          {crossBureauTradelineId && crossBureauBureauId && !thirdPartyEnabled && (
            <div className={styles.crossBureauToggle}>
              <div className={styles.crossBureauToggleText}>
                <FormLabel htmlFor="disputeBothSwitch" className={styles.crossBureauLabel}>
                  Dispute on both bureaus
                </FormLabel>
                <FormDescription>
                  This account also appears on {crossBureauBureauName || "another bureau"}. We can generate two separate letters for you at once.
                </FormDescription>
              </div>
              <Switch 
                id="disputeBothSwitch" 
                checked={form.values.disputeBoth} 
                onCheckedChange={(checked) => form.setValues((prev: any) => ({...prev, disputeBoth: checked}))} 
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={onCancel} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className={styles.createButton}>
              {isPending ? "Creating..." : isAutofillActive ? "Create Letter from Problem" : "Create Letter"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
};