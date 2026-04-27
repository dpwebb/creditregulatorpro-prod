import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import { checkDofdSolObstruction } from "./equifaxDisputeTemplate";
import { humanizeLabels } from "./humanizeLabels";
import { getViolationLabel } from "./getViolationLabel";
import { formatDate, formatCurrency, formatIfDate, buildReasonSpecificProblem, isTechnicalValue } from "./disputeNarrativeUtils";

export { getDisputeLetterFraming, buildViolationAwareAccountId } from "./disputeNarrativeFraming";

export interface DisputeNarrativeBuilderParams {
  violationCategory?: string | null;
  tradelineDetails?: TradelineDetails;
  violationDetails?: ViolationDetails;
  reasonDescription: string;
  additionalNotes?: string;
  expectedCorrectValue?: string;
}

export function disputeNarrativeBuilder({
  violationCategory,
  tradelineDetails,
  violationDetails,
  reasonDescription,
  additionalNotes,
  expectedCorrectValue,
}: DisputeNarrativeBuilderParams): string[] {
  const paragraphs: string[] = [];

  const isStatuteOfLimitations = violationCategory && [
    "STATUTE_OF_LIMITATIONS",
    "TIME_BARRED_DEBT_COLLECTION",
    "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
  ].includes(violationCategory);

  if (checkDofdSolObstruction(violationCategory, violationDetails, tradelineDetails)) {
    paragraphs.push(
      "The Date of First Delinquency is absent from my consumer disclosure. Without this required statutory anchor date, it is impossible to verify if this tradeline has exceeded its permissible retention period."
    );
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE") {
    if (violationDetails?.originalCreditorName || violationDetails?.matchReason) {
      const ocName = violationDetails.originalCreditorName || "the listed entity";
      paragraphs.push(`The entity listed as the Original Creditor, ${ocName}, appears to actually be a third-party debt collector or debt buyer.`);
      paragraphs.push(`Consumer reporting legislation requires accurate disclosure of the true original creditor. The current reporting obscures the true chain of title and misleads the consumer.`);
      if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
      return paragraphs;
    }

    if (violationDetails?.assignmentDocsFound === 0) {
      paragraphs.push(`This collection account lacks the required documentation proving a valid assignment or purchase of the debt.`);
      paragraphs.push(`Without a complete chain of title demonstrating the collector's legal right to collect and report this debt, the tradeline cannot be verified.`);
      paragraphs.push(`Please obtain a copy of the original contract and the bill of sale or deed of assignment, or delete this unverified account.`);
      if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
      return paragraphs;
    }

    if (violationDetails?.validationReceived === false) {
      const daysStr = violationDetails.daysElapsed != null ? `${violationDetails.daysElapsed} days` : "the required statutory timeframe";
      paragraphs.push(`A formal debt validation request was submitted to the furnisher, but they have failed to provide the required validation within ${daysStr}.`);
      paragraphs.push(`Continuing to report an unvalidated debt violates consumer reporting standards.`);
      paragraphs.push(`Please conduct an independent investigation or immediately remove this tradeline.`);
      if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
      return paragraphs;
    }
  }

  // Statute of Limitations — factual date-based argument
  if (isStatuteOfLimitations) {
    const dateParts: string[] = [];
    if (tradelineDetails?.openedDate) {
      dateParts.push(`opened on ${formatDate(tradelineDetails.openedDate)}`);
    }
    if (tradelineDetails?.dateOfLastPayment) {
      dateParts.push(`the last payment was made on ${formatDate(tradelineDetails.dateOfLastPayment)}`);
    } else if (tradelineDetails?.lastActivityDate) {
      dateParts.push(`the last activity was on ${formatDate(tradelineDetails.lastActivityDate)}`);
    }
    if (tradelineDetails?.dateOfFirstDelinquency) {
      dateParts.push(`the date of first delinquency was ${formatDate(tradelineDetails.dateOfFirstDelinquency)}`);
    }

    if (dateParts.length > 0) {
      const relevantDate = tradelineDetails?.dateOfLastPayment
        || tradelineDetails?.lastActivityDate
        || tradelineDetails?.dateOfFirstDelinquency
        || tradelineDetails?.openedDate;
      let yearsAgo = "";
      if (relevantDate) {
        const d = new Date(relevantDate);
        const now = new Date();
        const years = Math.floor((now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (years >= 1) {
          yearsAgo = ` That was over ${years} year${years > 1 ? "s" : ""} ago.`;
        }
      }
      paragraphs.push(
        `This account was ${dateParts.join(" and ")}.${yearsAgo} Under consumer reporting legislation, negative information may only remain on a credit file for a limited period. This account has exceeded that period.`
      );
    } else {
      paragraphs.push(
        `This account has been on my credit file beyond the maximum retention period allowed under consumer reporting legislation.`
      );
    }
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "MIXED_FILE_PERSONAL_INFO_MISMATCH") {
    const val = violationDetails?.detectedValue || "";
    const isDob = val === "DOB_MISMATCH" || val.toLowerCase().includes("date of birth") || val.toLowerCase().includes("dob");
    const isName = val === "NAME_MISMATCH" || val.toLowerCase().includes("name");
    const isProv = val === "PROVINCE_MISMATCH" || val.toLowerCase().includes("province");
    
    let baseText = "The personal information on this credit report does not match my actual identity, which suggests a mixed file.";
    if (isDob) {
      baseText = "The Date of Birth on my credit report does not match my actual Date of Birth, which strongly suggests this file has been mixed with another consumer's information.";
      const uDob = violationDetails?.technicalDetails?.userDob;
      const rDob = violationDetails?.technicalDetails?.reportDob;
      if (uDob && rDob) baseText += ` My actual DOB is ${uDob}, but the report shows ${rDob}.`;
    } else if (isName) {
      baseText = "The name listed on this credit report has significant differences from my actual name, which suggests a mixed file.";
      const uName = violationDetails?.technicalDetails?.userName;
      const rName = violationDetails?.technicalDetails?.reportName;
      if (uName && rName) baseText += ` My actual name is ${uName}, but the report shows ${rName}.`;
    } else if (isProv) {
      baseText = "The province listed on this credit report differs from my current province, which could indicate a mixed file error.";
      const uProv = violationDetails?.technicalDetails?.userProvince;
      const rProv = violationDetails?.technicalDetails?.reportProvince;
      if (uProv && rProv) baseText += ` My actual province is ${uProv}, but the report shows ${rProv}.`;
    }
    paragraphs.push(baseText);
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "COLLECTION_LIMITATION_EXCEEDED") {
    const prov = violationDetails?.technicalDetails?.province || "[province]";
    const limit = violationDetails?.technicalDetails?.limitationYears || "[limitationYears]";
    paragraphs.push(`This collection account has exceeded the legal time limit for collection activity. In ${prov}, the limitation period is ${limit} years, and this account is past that period.`);
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "CONSENT_WITHDRAWAL_NOT_HONORED") {
    const dateStr = violationDetails?.technicalDetails?.withdrawalDate;
    const formatted = dateStr ? (formatDate(dateStr) ?? "[date]") : "[date]";
    paragraphs.push(`This account was updated after I formally withdrew my consent to share information. Reporting continued after the consent withdrawal date of ${formatted}.`);
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "FREEZE_PERIOD_VIOLATION") {
    const val = violationDetails?.detectedValue || "";
    if (val === "INQUIRY_DURING_FREEZE" || val.toLowerCase().includes("inquiry")) {
      paragraphs.push("A hard inquiry was made on my credit file while I had an active security freeze in place. My file should not have been accessible.");
    } else {
      paragraphs.push("This account was opened while I had an active security freeze on my credit file. No new accounts should have been opened during this period.");
    }
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING") {
    const currentCollector = tradelineDetails?.collectionAgencyName || "this collector";
    const otherCollector = violationDetails?.otherAgencyName || violationDetails?.duplicateCreditorName || "another collection agency";
    
    let paragraph = `This debt is being reported by multiple collectors simultaneously. Both ${currentCollector} and ${otherCollector} are reporting this same debt.`;
    
    if (violationDetails?.duplicateAccountNumber) {
      paragraph += ` The duplicate account number is ${violationDetails.duplicateAccountNumber}.`;
    }
    if (violationDetails?.otherBalance) {
      paragraph += ` The other collector is reporting a balance of ${formatCurrency(violationDetails.otherBalance)}.`;
    }
    paragraph += ` This simultaneous reporting artificially inflates my debt load and violates consumer reporting legislation.`;
    
    paragraphs.push(paragraph);
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "PAYMENT_HISTORY_MANIPULATION") {
    if (violationDetails?.userExplanation) {
      paragraphs.push(violationDetails.userExplanation);
    } else {
      paragraphs.push("The payment history for this account contains errors that don't match what was previously reported.");
    }
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "ACCOUNT_STATUS_INCONSISTENCY") {
    if (violationDetails?.userExplanation) {
      paragraphs.push(violationDetails.userExplanation);
    } else if (tradelineDetails?.status && tradelineDetails?.balance) {
      paragraphs.push(`This account shows a status of ${tradelineDetails.status} but still reports a balance of ${formatCurrency(tradelineDetails.balance)}, which is contradictory.`);
    } else {
      paragraphs.push("The account status is inconsistent with other reported information.");
    }
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationCategory === "DISCLOSURE_DEFICIENCY") {
    if (violationDetails?.userExplanation) {
      paragraphs.push(violationDetails.userExplanation);
    } else {
      paragraphs.push("The credit report is missing required information for this account.");
    }
    if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);
    return paragraphs;
  }

  if (violationDetails && (violationDetails.detectedValue || violationDetails.expectedValue || violationDetails.omissions || violationDetails.notes)) {
    if (!isStatuteOfLimitations) {
      let detectedValue = violationDetails.detectedValue;
      let expectedValue = violationDetails.expectedValue;
      
      const techDetected = isTechnicalValue(detectedValue, violationDetails.fieldName, expectedValue);
      const techExpected = isTechnicalValue(expectedValue, violationDetails.fieldName, detectedValue);

      if (techDetected || techExpected) {
        if (violationDetails.userExplanation) {
          paragraphs.push(violationDetails.userExplanation);
        } else {
          const reasonSpecific = tradelineDetails ? buildReasonSpecificProblem(reasonDescription, tradelineDetails) : null;
          if (reasonSpecific) {
            paragraphs.push(reasonSpecific);
          } else {
            paragraphs.push(`The reported information is inaccurate: ${reasonDescription.toLowerCase()}.`);
          }
        }
      } else {
        let isMissing = false;
        let parsedMissingField = "";

        if (detectedValue === null || detectedValue === undefined || detectedValue === "" || detectedValue === "null" || detectedValue === "0 or null") {
          isMissing = true;
        } else if (detectedValue.startsWith("Missing: ")) {
          isMissing = true;
          parsedMissingField = detectedValue.replace("Missing: ", "").trim();
        }

        if (expectedValue === "All required fields present") {
          expectedValue = undefined;
        } else if (expectedValue === "Valid rating (e.g., R1, I2)") {
          expectedValue = "a valid payment rating";
        }

        let fieldNameText = "";
        if (violationDetails.fieldName) {
          fieldNameText = humanizeLabels.humanizeFieldName(violationDetails.fieldName);
        } else if (parsedMissingField) {
          fieldNameText = humanizeLabels.humanizeFieldName(parsedMissingField);
        }

        const isMoneyField = fieldNameText.toLowerCase().includes("balance") || 
                             fieldNameText.toLowerCase().includes("amount") || 
                             fieldNameText.toLowerCase().includes("limit") || 
                             fieldNameText.toLowerCase().includes("payment");

        const smartFormat = (val: string | null | undefined, isExpectedPhrase: boolean = false): string | undefined => {
          if (!val) return undefined;
          if (isExpectedPhrase && val === "a valid payment rating") return val;
          
          const dateFormatted = formatIfDate(val);
          if (dateFormatted !== val) return `"${dateFormatted}"`;
          
          if (isMoneyField && !isNaN(parseFloat(val))) {
            const money = formatCurrency(val);
            if (money) return money;
          }
          
          return `"${val}"`;
        };

        if (isMissing) {
          if (fieldNameText) {
            paragraphs.push(`The ${fieldNameText} for this account is not included in my credit file. This is required information — without it, the accuracy and completeness of this tradeline cannot be verified.`);
          } else {
            const correct = expectedValue ? smartFormat(expectedValue, true) : (expectedCorrectValue ? smartFormat(expectedCorrectValue, true) : undefined);
            if (correct) {
              paragraphs.push(`This account is missing required information. The value should be ${correct}. Without it, the accuracy and completeness of this tradeline cannot be verified.`);
            } else {
              paragraphs.push(`This account is missing required information. Without it, the accuracy and completeness of this tradeline cannot be verified.`);
            }
          }
        } else {
          let safeDetectedValue = detectedValue;
          if (safeDetectedValue && /^[A-Z][A-Z0-9_]+$/.test(safeDetectedValue)) {
            safeDetectedValue = violationDetails.userExplanation || getViolationLabel(violationCategory);
          }

          const formattedDetected = smartFormat(safeDetectedValue);
          const formattedExpected = smartFormat(expectedValue, true);
          
          if (expectedValue) {
            if (fieldNameText) {
              paragraphs.push(`The ${fieldNameText} for this account is reported as ${formattedDetected}, but the correct value is ${formattedExpected}. This inaccuracy must be corrected.`);
            } else {
              paragraphs.push(`The reported value ${formattedDetected} is incorrect. The correct value is ${formattedExpected}. This inaccuracy must be corrected.`);
            }
          } else {
            if (fieldNameText) {
              paragraphs.push(`The ${fieldNameText} for this account is reported as ${formattedDetected}, which is inaccurate.`);
            } else {
              paragraphs.push(`The reported value ${formattedDetected} is inaccurate.`);
            }
          }
        }
      }
    }

    if (violationDetails.omissions) paragraphs.push(violationDetails.omissions);
    if (violationDetails.notes) paragraphs.push(violationDetails.notes);
  } else {
    if (tradelineDetails && !violationDetails) {
      const reasonSpecific = buildReasonSpecificProblem(reasonDescription, tradelineDetails);
      if (reasonSpecific) paragraphs.push(reasonSpecific);
    } else {
      paragraphs.push(`The reported information is inaccurate: ${reasonDescription.toLowerCase()}.`);
    }

    if (expectedCorrectValue) {
      paragraphs.push(`The correct information should be: ${expectedCorrectValue}.`);
    }
  }

  if (additionalNotes) paragraphs.push(`Additional notes: ${additionalNotes}`);

  if (paragraphs.length === 0) {
    paragraphs.push(`The reported information is inaccurate: ${reasonDescription.toLowerCase()}.`);
  }

  return paragraphs;
}