import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/PageHeader";


import { FraudFreezeManager } from "../components/FraudFreezeManager";
import { FreezeProtectionStats } from "../components/FreezeProtectionStats";
import { FreezeTimeline } from "../components/FreezeTimeline";
import { IdentityTheftNoProtectionAlert } from "../components/IdentityTheftNoProtectionAlert";
import { IdentityTheftProtectionLayout } from "../components/IdentityTheftProtectionLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/Accordion";
import { Info } from "lucide-react";
import { getFreezeList } from "../endpoints/fraud-freeze/list_GET.schema";
import styles from "./identity-theft-protection.module.css";

export default function IdentityTheftProtectionPage() {
  

  const { data, isFetching } = useQuery({
    queryKey: ["fraud-freeze", "list"],
    queryFn: () => getFreezeList(),
    placeholderData: (prev) => prev,
  });

  const freezes = data?.freezes ?? [];
  const hasActiveProtection = useMemo(() => 
    freezes.some(f => f.status === "active"), 
    [freezes]
  );

  return (
    <div className={styles.pageContainer}>
      <PageHeader
        title="Identity Theft Protection"
        subtitle="Manage fraud alerts and security freezes across Canadian credit bureaus"
        
      />

      <div className={styles.content}>
        <IdentityTheftNoProtectionAlert 
          hasActiveProtection={hasActiveProtection} 
          isLoading={isFetching} 
        />

        <FreezeProtectionStats 
          freezes={freezes} 
          isLoading={isFetching} 
          className={styles.stats}
        />

        <IdentityTheftProtectionLayout
          main={<FraudFreezeManager />}
          aside={<FreezeTimeline freezes={freezes} />}
        />

        <div className={styles.helpSection}>
          <div className={styles.helpHeader}>
            <Info size={20} className={styles.helpIcon} />
            <h2>Understanding Your Rights</h2>
          </div>
          
          <Accordion type="single" collapsible className={styles.accordion}>
            <AccordionItem value="item-1">
              <AccordionTrigger>Fraud Alert vs. Security Freeze</AccordionTrigger>
              <AccordionContent>
                <div className={styles.accordionContent}>
                  <p>
                    <strong>Fraud Alert:</strong> A notice on your credit file that alerts creditors you may be a victim of fraud. 
                    Creditors are encouraged to verify your identity before extending credit. 
                    An initial alert lasts 90 days, while an extended alert lasts 7 years (requires a police report).
                  </p>
                  <p>
                    <strong>Security Freeze:</strong> A more drastic measure that locks your credit file entirely. 
                    Creditors cannot access your report to open new accounts unless you temporarily "thaw" the freeze. 
                    This offers the highest level of protection but requires more management when you need credit.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Canadian Consumer Rights</AccordionTrigger>
              <AccordionContent>
                <p>
                  In Canada, you have the right to place a fraud alert on your credit file at no cost. 
                  Security freezes (also known as credit locks) are also available, though some bureaus may charge a fee depending on your province, 
                  unless you are a confirmed victim of identity theft.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>How to Thaw a Freeze</AccordionTrigger>
              <AccordionContent>
                <p>
                  If you have a security freeze in place and need to apply for credit (e.g., a mortgage, car loan, or credit card), 
                  you must request a "thaw". You can schedule a thaw for a specific duration (e.g., 3 days) or for a specific creditor. 
                  Plan ahead, as thaws can take up to 24 hours to become effective.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}