import { ComprehensiveParseResult, ParsedTradeline, ExtractedReportMetadata, ExtractedPaymentHistory, ExtractedEmploymentInfo, ExtractedInquiry, ExtractedPublicRecord, ExtractedConsumerStatement } from "./reportParserTypes";
import { LLMResponse } from "./docstrangeLLM";
import { parse, isValid } from "./dateUtils";
import { normalizeTransUnionPaymentTerms } from "./transunionPaymentTerms";

// --- Helper: Map DocStrange Response to ComprehensiveParseResult ---

export function mapDocStrangeResponseToResult(docStrangeData: LLMResponse, rawText: string, overriddenLLMData?: LLMResponse): ComprehensiveParseResult {
  if (overriddenLLMData) {
    docStrangeData = overriddenLLMData;
  }

  // --- Post-processing Validation & Cleanup ---
  
  // 1. Deduplicate addresses
  if (docStrangeData.addresses) {
    const seenAddresses = new Set<string>();
    docStrangeData.addresses = docStrangeData.addresses.filter(a => {
      const norm = (a.address || "").toLowerCase().replace(/,\s*$/, "").trim();
      if (!norm) return true;
      if (seenAddresses.has(norm)) {
        // Drop duplicates if they come from the form (often typed "Current" or "Previous")
        if (a.type === "Current" || a.type === "Previous" || !a.type) {
          return false;
        }
      }
      seenAddresses.add(norm);
      return true;
    });
  }

  // 2. Deduplicate employments
  if (docStrangeData.employments) {
    const empMap = new Map<string, any>();
    const noNameEmps: any[] = [];
    for (const e of docStrangeData.employments) {
      const key = (e.employerNameCityProvince || "").toLowerCase().trim();
      if (!key) {
        noNameEmps.push(e);
        continue;
      }
      if (empMap.has(key)) {
        const existing = empMap.get(key);
        const existingScore = (existing.date ? 1 : 0) + (existing.occupation ? 1 : 0);
        const currentScore = (e.date ? 1 : 0) + (e.occupation ? 1 : 0);
        // Keep the one with more data
        if (currentScore > existingScore) {
          empMap.set(key, e);
        }
      } else {
        empMap.set(key, e);
      }
    }
    docStrangeData.employments = [...Array.from(empMap.values()), ...noNameEmps];
  }

  // 3. Fix phone extension/type mapping
  if (docStrangeData.telephoneNumbers) {
    for (const tel of docStrangeData.telephoneNumbers) {
      if (tel.type && /^\d{1,9}$/.test(tel.type) && !tel.extension) {
        tel.extension = tel.type;
        tel.type = null;
      }
    }
  }

  // Helper to parse date string to Date object
  const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const str = dateStr.trim();

    const lowerStr = str.toLowerCase();
    if (lowerStr === "—" || lowerStr === "-" || lowerStr === "missing" || lowerStr === "n/a" || lowerStr === "0") {
      return null;
    }

    const monthYearMatch = str.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthYearMatch) {
      const d = parse(str, "MMMM yyyy", new Date());
      if (isValid(d)) return d;
    }

    let d = parse(str, "MMM d, yyyy", new Date());
    if (isValid(d)) return d;

    d = new Date(str);
    return isValid(d) ? d : null;
  };

  // 1. Map Tradelines
  const tradelines: ParsedTradeline[] = (docStrangeData.tradelines || []).map((t: any) => {
    const parseAmount = (value: unknown): number | undefined => {
      if (value == null || value === "") return undefined;
      const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const normalizedPaymentTerms = normalizeTransUnionPaymentTerms({
      terms: t.terms ?? undefined,
      monthlyPayment: parseAmount(t.monthlyPayment),
      scheduledMonthlyPayment: parseAmount(t.scheduledMonthlyPayment),
      paymentFrequency: t.paymentFrequency ?? undefined,
    });
    const parsed: ParsedTradeline = {
      creditorName: t.creditorName || "Unknown Creditor",
    accountNumber: t.accountNumber || "",
    accountType: (t.accountType ?? "Unknown").toUpperCase(),
    balance: t.balance ?? 0,
    status: t.status || "",
    isCollectionAccount: t.isCollectionAccount === true || (t.accountType || "").toUpperCase() === "COLLECTION",
    dateAssignedToCollection: parseDate(t.dateAssignedToCollection),
    collectionAgencyName: t.collectionAgencyName ?? undefined,
    originalCreditorName: t.originalCreditorName || t.memberName || undefined,
    dates: {
      opened: parseDate(t.dateOpened || t.openedDate),
      reported: parseDate(t.dateReported || t.reportedDate),
      closed: parseDate(t.dateClosed || t.closedDate),
      dofd: parseDate(t.dateOfFirstDelinquency || t.firstDelinquencyDate),
    },
    amounts: {
      high: t.highCredit != null ? t.highCredit : undefined,
      pastDue: t.pastDue != null ? t.pastDue : undefined,
    },
    postedDate: parseDate(t.postedDate),
    chargeOffDate: parseDate(t.chargeOffDate),
    balloonPaymentDate: parseDate(t.balloonPaymentDate),
    lastActivityDate: parseDate(t.lastActivityDate),
    lastPaymentDate: parseDate(t.lastPaymentDate),
    creditLimit: t.creditLimit != null ? t.creditLimit : undefined,
    monthlyPayment: normalizedPaymentTerms.monthlyPayment ?? undefined,
    scheduledMonthlyPayment: normalizedPaymentTerms.scheduledMonthlyPayment ?? undefined,
    paymentFrequency: normalizedPaymentTerms.paymentFrequency ?? undefined,
    paymentPattern: (() => {
      let pattern = t.paymentHistoryProfile || t.paymentPattern || undefined;
      if (pattern) {
        const p = pattern.toLowerCase();
        if (
          p.includes("last payment") ||
          p.includes("terms") ||
          p.includes("date") ||
          (!/[0-9cxo\-]/i.test(pattern) && !p.includes("30d:"))
        ) {
          pattern = undefined;
        }
      }
      return pattern;
    })(),
    responsibilityCode: t.responsibilityCode ?? undefined,
    remarkCodes: [t.remarks, t.legend].filter(Boolean) as string[],
    sourceText: t.sourceText || "",
    terms: normalizedPaymentTerms.terms ?? undefined,
    mop: (() => {
      const inferredMop = t.mop != null && String(t.mop) !== "0" ? String(t.mop) : undefined;
      const detailMop = (t.paymentHistoryDetails?.[0] as any)?.mop != null ? String((t.paymentHistoryDetails?.[0] as any)?.mop) : undefined;
      return inferredMop || detailMop;
    })(),
    };

    const monthsReviewed = t.monthsReviewed != null ? parseInt(String(t.monthsReviewed), 10) : undefined;
    parsed.paymentHistoryProfile = parsed.paymentPattern ?? null;
    parsed.paymentHistory = t.paymentHistory ?? null;
    parsed.paymentHistoryDetails = Array.isArray(t.paymentHistoryDetails) ? t.paymentHistoryDetails : null;
    parsed.monthsReviewed = Number.isFinite(monthsReviewed) ? monthsReviewed : undefined;
    parsed.creditorPhone = t.creditorPhone ?? null;
    parsed.memberNumber = t.memberNumber ?? null;
    parsed.ratingCode = t.ratingCode ?? null;
    parsed.ratingCodeDescription = t.ratingCodeDescription ?? null;
    parsed.notes = t.notes ?? null;
    parsed.amountWrittenOff = t.amountWrittenOff ?? null;
    parsed.dateVerified = t.dateVerified ?? null;
    parsed.datePaidSettled = t.datePaidSettled ?? null;

    return parsed;
  });

  // 2. Map Payment Histories (Extracted Payment History)
  const paymentHistories: ExtractedPaymentHistory[] = (docStrangeData.tradelines || []).map((t: any) => {
    const parseAmount = (value: unknown): number | undefined => {
      if (value == null || value === "") return undefined;
      const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const normalizedPaymentTerms = normalizeTransUnionPaymentTerms({
      terms: t.terms ?? undefined,
      monthlyPayment: parseAmount(t.monthlyPayment),
      scheduledMonthlyPayment: parseAmount(t.scheduledMonthlyPayment),
      paymentFrequency: t.paymentFrequency ?? undefined,
    });
    let pattern = t.paymentHistoryProfile || t.paymentPattern || null;
    if (pattern) {
      const p = pattern.toLowerCase();
      if (
        p.includes("last payment") ||
        p.includes("terms") ||
        p.includes("date") ||
        (!/[0-9cxo\-]/i.test(pattern) && !p.includes("30d:"))
      ) {
        pattern = null;
      }
    }
    
    let times30DaysLate = t.paymentHistory?.["30"] ?? null;
    let times60DaysLate = t.paymentHistory?.["60"] ?? null;
    let times90DaysLate = t.paymentHistory?.["90"] ?? null;
    let times120DaysLate = null;

    if (!t.paymentHistory && Array.isArray(t.paymentHistoryDetails) && t.paymentHistoryDetails.length > 0) {
      let count30 = 0;
      let count60 = 0;
      let count90 = 0;
      let count120 = 0;

      for (const detail of t.paymentHistoryDetails) {
        const mopStr = String(detail.mop || "").trim();
        const mopNum = parseInt(mopStr, 10);
        
        if (!isNaN(mopNum)) {
          if (mopNum === 2) count30++;
          else if (mopNum === 3) count60++;
          else if (mopNum === 4) count90++;
          else if (mopNum >= 5) count120++;
        } else if (detail.pastDue && detail.pastDue > 0) {
          count30++;
        }
      }

      times30DaysLate = count30;
      times60DaysLate = count60;
      times90DaysLate = count90;
      times120DaysLate = count120;
    }

    const result = {
      paymentPattern: pattern,
      responsibilityCode: null,
      ecoaCode: null,
      complianceConditionCode: null,
      specialCommentCodes: [],
      times30DaysLate,
      times60DaysLate,
      times90DaysLate,
      times120DaysLate,
      worstDelinquencyCode: null,
      worstDelinquencyDate: null,
      accountCondition: t.status || null,
      monthlyPayment: normalizedPaymentTerms.scheduledMonthlyPayment ?? normalizedPaymentTerms.monthlyPayment ?? null,
      termsFrequency: normalizedPaymentTerms.paymentFrequency ?? null,
      termsMonths: null,
      lastPaymentAmount: null,
      lastActivityDate: parseDate(t.lastPaymentDate), // using as fallback
      lastReportedDate: parseDate(t.dateReported || t.reportedDate),
      lastPaymentDate: parseDate(t.lastPaymentDate),
      rawSectionText: JSON.stringify(t.paymentHistoryDetails || []),
      confidence: 90,
    };
    
    (result as any).paymentHistoryDetails = t.paymentHistoryDetails || [];
    (result as any).paymentHistorySummary = t.paymentHistory || null;
    (result as any).monthsReviewed = t.paymentHistory?.["#M"] ?? t.monthsReviewed ?? null;
    
    return result;
  });

  // 3. Map Metadata
  const reportMetadata: ExtractedReportMetadata = {
    reportDate: parseDate(docStrangeData.reportDate),
    bureauName: docStrangeData.bureau ?? null,
    confidence: 100, // Assumed high since DocStrange extracted it
    reportNumber: null,
    fileNumber: null,
    bureauFileId: null,
    bureauPhone: null,
    bureauAddress: null,
    totalAccounts: tradelines.length,
    openAccounts: null,
    closedAccounts: null,
    delinquentAccounts: null,
    derogatoryAccounts: null,
    totalBalances: null,
    totalCreditLimit: null,
    utilizationPercent: null,
    fraudAlertActive: false,
    securityFreezeActive: false,
    activeDisputePresent: false,
    militaryLendingActCovered: false,
    oldestAccountDate: null,
    newestAccountDate: null,
    averageAccountAge: null,
    rawHeaderText: null,
  };

  // 4. Map Consumer Info (Addresses, Phone, DOB)
  let bestPhone = null;
  let phoneSecondary = null;
  if (docStrangeData.telephoneNumbers && docStrangeData.telephoneNumbers.length > 0) {
    bestPhone = docStrangeData.telephoneNumbers[0].number || null;
    if (docStrangeData.telephoneNumbers.length > 1) {
      phoneSecondary = docStrangeData.telephoneNumbers[1].number || null;
    }
  }

  let currentAddrLine1 = docStrangeData.consumerInfo?.currentAddress || null;
  let currentCity = null;
  let currentProv = null;
  let currentPostal = null;
  
  const previousAddressesList = [];
  if (docStrangeData.addresses && docStrangeData.addresses.length > 0) {
    // Current is usually first
    const curr = docStrangeData.addresses[0];
    currentAddrLine1 = curr.address || currentAddrLine1;
    currentCity = curr.city || null;
    currentProv = curr.province || null;
    currentPostal = curr.postalCode || null;

    // Remaining are previous
    for (let i = 1; i < docStrangeData.addresses.length; i++) {
      const a = docStrangeData.addresses[i];
      previousAddressesList.push({
        rawText: a.address || "",
        addressLine1: a.address || null,
        addressLine2: null,
        city: a.city || null,
        province: a.province || null,
        postalCode: a.postalCode || null,
        dateReported: parseDate(a.sinceDate)
      });
    }
  }

  // Fallback for previous addresses if not in structured 'addresses' list
  if (previousAddressesList.length === 0 && docStrangeData.consumerInfo?.previousAddresses) {
    docStrangeData.consumerInfo.previousAddresses.forEach(a => {
      previousAddressesList.push({
        rawText: a,
        addressLine1: a,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        dateReported: null
      });
    });
  }

  const dateOfBirthRaw = docStrangeData.consumerInfo?.dateOfBirth || docStrangeData.personalInfo?.birthDate || null;
  const dob = parseDate(dateOfBirthRaw);

  let fullName = docStrangeData.consumerInfo?.fullName || null;
  if (!fullName && docStrangeData.personalInfo?.surname && docStrangeData.personalInfo?.givenNames) {
    fullName = `${docStrangeData.personalInfo.givenNames} ${docStrangeData.personalInfo.surname}`;
  }

  const sinLastDigits = docStrangeData.personalInfo?.socialInsuranceNo || (docStrangeData as any).consumerInfo?.socialInsuranceNo || null;

  const consumerInfo = {
    fullName: fullName,
    addressLine1: currentAddrLine1,
    addressLine2: null,
    city: currentCity, 
    province: currentProv, 
    postalCode: currentPostal,
    dateOfBirth: dob,
    dateOfBirthRaw: dateOfBirthRaw,
    phone: bestPhone,
    phoneSecondary: phoneSecondary,
    sinLastDigits: sinLastDigits,
    previousAddresses: previousAddressesList,
    confidence: 90
  };

  // 5. Map Employments
  const employmentInfo: ExtractedEmploymentInfo[] = (docStrangeData.employments || []).map(e => ({
    employerName: e.employerNameCityProvince || null,
    occupation: e.occupation || null,
    employmentStatus: null,
    salary: e.pay ? parseFloat(e.pay.replace(/[^0-9.-]+/g,"")) : null,
    salaryFrequency: e.payFrequency || null,
    hireDate: parseDate(e.startDate) || parseDate(e.date),
    terminationDate: parseDate(e.finishDate),
    verifiedDate: parseDate(e.date),
    employerAddress: null,
    employerCity: null,
    employerProvince: null,
    employerPostalCode: null,
    employerPhone: null,
    isCurrent: e.finishDate 
      ? false 
      : (((e as any).type?.toLowerCase() === "current" || e.occupation?.toLowerCase() === "current") 
          ? true 
          : (((e as any).type?.toLowerCase() === "previous" || e.occupation?.toLowerCase() === "previous") 
              ? false 
              : null)),
    rawSectionText: JSON.stringify(e),
    confidence: 85,
  }));

  // 6. Map Inquiries (Merge credit, non-credit, account review)
  const mapInquiry = (i: any, defaultType: "hard"|"soft"|"promotional"|"unknown"): ExtractedInquiry => {
    let type = defaultType;
    const t = (i.type || "").toLowerCase();
    if (t.includes("hard")) type = "hard";
    else if (t.includes("soft")) type = "soft";
    else if (t.includes("promo")) type = "promotional";

    return {
      inquiryType: type,
      creditorName: i.creditorName || i.authorizedUserName || "Unknown",
      inquiryDate: parseDate(i.date),
      inquiryPurpose: null,
      subscriberCode: null,
      industryCode: null,
      rawSectionText: `Inquiry: ${i.creditorName || i.authorizedUserName || "Unknown"} - ${i.date || "Unknown"}`,
      confidence: 85
    };
  };

  const allInquiries: ExtractedInquiry[] = [];
  (docStrangeData.inquiries || []).forEach(i => allInquiries.push(mapInquiry(i, "unknown")));
  (docStrangeData.creditRelatedInquiries || []).forEach(i => allInquiries.push(mapInquiry(i, "hard")));
  (docStrangeData.nonCreditRelatedInquiries || []).forEach(i => allInquiries.push(mapInquiry(i, "soft")));
  (docStrangeData.accountReviewInquiries || []).forEach(i => allInquiries.push(mapInquiry(i, "soft")));

  // Deduplicate slightly by stringifying
  const uniqueInquiriesMap = new Map();
  allInquiries.forEach(i => {
    const key = `${i.creditorName}-${i.inquiryDate?.getTime()}`;
    if (!uniqueInquiriesMap.has(key)) uniqueInquiriesMap.set(key, i);
  });
  const inquiries = Array.from(uniqueInquiriesMap.values());

  // 7. Map Insolvency & Public Records
  const mapPublicRecord = (p: any): ExtractedPublicRecord => {
    let recordType: "bankruptcy" | "civil_judgment" | "foreclosure" | "judgment" | "tax_lien" | "wage_garnishment" | "other" = "other";
    const t = (p.type || "").toLowerCase();
    if (t.includes("bankrupt")) recordType = "bankruptcy";
    else if (t.includes("judgment")) recordType = "judgment";
    else if (t.includes("lien")) recordType = "tax_lien";
    else if (t.includes("foreclos")) recordType = "foreclosure";
    else if (t.includes("garnish")) recordType = "wage_garnishment";

    return {
      recordType,
      filingDate: parseDate(p.dateFiled),
      dischargeDate: parseDate(p.dateOfDischarge),
      amount: p.amount || p.liabilityAmount || null,
      caseNumber: null,
      courtName: p.court || "Unknown",
      status: p.status || null,
      plaintiff: p.trustee || null,
      rawSectionText: JSON.stringify(p),
      confidence: 85
    };
  };

  const allPublicRecords: ExtractedPublicRecord[] = [];
  (docStrangeData.publicRecords || []).forEach(p => allPublicRecords.push(mapPublicRecord(p)));
  (docStrangeData.insolvency || []).forEach(p => allPublicRecords.push(mapPublicRecord(p)));

  const uniqueRecordsMap = new Map();
  allPublicRecords.forEach(p => {
    const key = `${p.recordType}-${p.filingDate?.getTime()}`;
    if (!uniqueRecordsMap.has(key)) uniqueRecordsMap.set(key, p);
  });
  let publicRecords = Array.from(uniqueRecordsMap.values());

  // Filter out misclassified public records (often regular tradelines dumped here by the LLM)
  publicRecords = publicRecords.filter(p => {
    if (p.recordType !== "other") return true;
    
    const hasValidCourt = p.courtName && p.courtName.trim() !== "" && p.courtName !== "Unknown";
    const hasDateOrCase = p.filingDate != null || (p.caseNumber && p.caseNumber.trim() !== "");
    
    if (hasValidCourt && hasDateOrCase) {
      return true;
    }
    
    console.warn(`[DocStrange Parser] Discarding likely misclassified public record (type "other" without sufficient details):`, p);
    return false;
  });

  // 8. Map Consumer Statements
  const consumerStatements: ExtractedConsumerStatement[] = ((docStrangeData as any).consumerStatements || []).map((s: any) => ({
    statementType: s.statementType || "general_statement",
    statementText: s.statementText || "",
    effectiveDate: parseDate(s.effectiveDate) || null,
    expirationDate: parseDate(s.expirationDate) || null,
    addedDate: parseDate(s.addedDate) || null,
    rawSectionText: s.rawSectionText || s.statementText || "",
    confidence: s.confidence || 85,
  }));

  return {
    tradelines,
    sourceBureau: docStrangeData.bureau ? { bureauName: docStrangeData.bureau, confidence: 90 } : null,
    consumerInfo,
    rawText,
    reportMetadata,
    creditScores: (docStrangeData.scores || []).map(s => ({
      scoreType: s.scoreType || "Unknown Credit Score",
      scoreValue: s.score || 0,
      scoreDate: parseDate(s.date),
      scoreFactors: [], 
      bureauName: docStrangeData.bureau || null,
      scoreRangeMin: 300,
      scoreRangeMax: 900,
      rawSectionText: `Score: ${s.score} (${s.scoreType})`,
      confidence: 85
    })),
    inquiries,
    publicRecords,
    consumerStatements, 
    employmentInfo,
    paymentHistories,
  };
}

