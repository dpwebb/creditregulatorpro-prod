export type DefaultMappingEntry = {
  bureau: string;
  section: "tradeline" | "consumer_info" | "inquiry" | "public_record" | "employment" | "metadata";
  sourcePath: string;
  targetField: string;
  transformType: "direct" | "date_parse" | "numeric" | "regex_extract" | "uppercase" | "lowercase" | "boolean" | "fallback_chain";
  description: string;
};

const COMMON_TRADELINE: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "tradeline", sourcePath: "creditorName", targetField: "creditorName", transformType: "direct", description: "Direct map to creditorName" },
  { section: "tradeline", sourcePath: "accountNumber", targetField: "accountNumber", transformType: "direct", description: "Direct map to accountNumber" },
  { section: "tradeline", sourcePath: "accountType", targetField: "accountType", transformType: "uppercase", description: "Uppercase accountType" },
  { section: "tradeline", sourcePath: "balance", targetField: "balance", transformType: "numeric", description: "Extract numeric balance" },
  { section: "tradeline", sourcePath: "status", targetField: "status", transformType: "direct", description: "Direct map to status" },
  { section: "tradeline", sourcePath: "dateOpened/openedDate", targetField: "dates.opened", transformType: "fallback_chain", description: "Fallback chain then date_parse. Note: EQ uses YYYY/MM/DD dates, TU uses 'MMM DD, YYYY'." },
  { section: "tradeline", sourcePath: "dateReported/reportedDate", targetField: "dates.reported", transformType: "fallback_chain", description: "Fallback chain then date_parse." },
  { section: "tradeline", sourcePath: "dateClosed/closedDate", targetField: "dates.closed", transformType: "date_parse", description: "Applies date_parse." },
  { section: "tradeline", sourcePath: "dateOfFirstDelinquency", targetField: "dates.dofd", transformType: "date_parse", description: "Applies date_parse." },
  { section: "tradeline", sourcePath: "highCredit", targetField: "amounts.high", transformType: "numeric", description: "Extract numeric high credit." },
  { section: "tradeline", sourcePath: "pastDue", targetField: "amounts.pastDue", transformType: "numeric", description: "Extract numeric past due." },
  { section: "tradeline", sourcePath: "creditLimit", targetField: "creditLimit", transformType: "numeric", description: "Extract numeric credit limit." },
  { section: "tradeline", sourcePath: "monthlyPayment", targetField: "monthlyPayment", transformType: "numeric", description: "Extract numeric monthly payment." },
  { section: "tradeline", sourcePath: "responsibilityCode", targetField: "responsibilityCode", transformType: "direct", description: "Direct map to responsibilityCode." },
  { section: "tradeline", sourcePath: "remarks/legend", targetField: "remarkCodes", transformType: "direct", description: "Direct map to remarkCodes." },
  { section: "tradeline", sourcePath: "isCollectionAccount", targetField: "isCollectionAccount", transformType: "boolean", description: "Cast to boolean." },
  { section: "tradeline", sourcePath: "collectionAgencyName", targetField: "collectionAgencyName", transformType: "direct", description: "Direct map to collectionAgencyName." },
  { section: "tradeline", sourcePath: "originalCreditorName/memberName", targetField: "originalCreditorName", transformType: "fallback_chain", description: "Fallback chain to originalCreditorName." },
  { section: "tradeline", sourcePath: "lastActivityDate", targetField: "lastActivityDate", transformType: "date_parse", description: "Applies date_parse." },
  { section: "tradeline", sourcePath: "lastPaymentDate", targetField: "lastPaymentDate", transformType: "date_parse", description: "Applies date_parse." },
  { section: "tradeline", sourcePath: "paymentHistoryProfile/paymentPattern", targetField: "paymentPattern", transformType: "direct", description: "Direct map to paymentPattern." },
  { section: "tradeline", sourcePath: "terms", targetField: "terms", transformType: "direct", description: "Direct map to terms." },
  { section: "tradeline", sourcePath: "mop", targetField: "mop", transformType: "direct", description: "Direct map to mop." },
];

const COMMON_CONSUMER_INFO: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "consumer_info", sourcePath: "consumerInfo.fullName", targetField: "fullName", transformType: "direct", description: "Direct map to consumer full name." },
  { section: "consumer_info", sourcePath: "personalInfo.birthDate", targetField: "dateOfBirth", transformType: "date_parse", description: "Applies date_parse to birth date." },
  { section: "consumer_info", sourcePath: "addresses[0]", targetField: "currentAddress", transformType: "direct", description: "Direct map first address object." },
  { section: "consumer_info", sourcePath: "telephoneNumbers[0].number", targetField: "phone", transformType: "direct", description: "Direct map first telephone number." },
];

const COMMON_INQUIRY: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "inquiry", sourcePath: "creditorName", targetField: "creditorName", transformType: "direct", description: "Direct map to creditorName." },
  { section: "inquiry", sourcePath: "date", targetField: "inquiryDate", transformType: "date_parse", description: "Applies date_parse to inquiry date." },
  { section: "inquiry", sourcePath: "type", targetField: "inquiryType", transformType: "direct", description: "Direct map to inquiry type." },
];

const COMMON_PUBLIC_RECORD: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "public_record", sourcePath: "type", targetField: "recordType", transformType: "direct", description: "Direct map to public record type." },
  { section: "public_record", sourcePath: "dateFiled", targetField: "filingDate", transformType: "date_parse", description: "Applies date_parse to filing date." },
  { section: "public_record", sourcePath: "status", targetField: "status", transformType: "direct", description: "Direct map to status." },
  { section: "public_record", sourcePath: "amount", targetField: "amount", transformType: "numeric", description: "Extract numeric amount." },
  { section: "public_record", sourcePath: "court", targetField: "courtName", transformType: "direct", description: "Direct map to court name." },
];

const COMMON_EMPLOYMENT: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "employment", sourcePath: "employerNameCityProvince", targetField: "employerName", transformType: "direct", description: "Direct map to employer name." },
  { section: "employment", sourcePath: "occupation", targetField: "occupation", transformType: "direct", description: "Direct map to occupation." },
  { section: "employment", sourcePath: "date", targetField: "hireDate", transformType: "date_parse", description: "Applies date_parse to employment date." },
];

const COMMON_METADATA: Omit<DefaultMappingEntry, "bureau">[] = [
  { section: "metadata", sourcePath: "reportDate", targetField: "reportDate", transformType: "date_parse", description: "Applies date_parse to report date. Note: EQ uses YYYY/MM/DD, TU uses MMM DD, YYYY." },
  { section: "metadata", sourcePath: "bureau", targetField: "bureauName", transformType: "direct", description: "Direct map to bureau name." },
];

/**
 * Retrieves the static registry of all current hardcoded mapping definitions.
 * This mirrors what docstrangeParser.mapDocStrangeResponseToResult does in code,
 * making it visible to the admin UI for overrides.
 * 
 * @param bureau Optional filter by bureau name (e.g. "TransUnion" or "Equifax")
 */
export function getDefaultMappings(bureau?: string): DefaultMappingEntry[] {
  const common = [
    ...COMMON_TRADELINE,
    ...COMMON_CONSUMER_INFO,
    ...COMMON_INQUIRY,
    ...COMMON_PUBLIC_RECORD,
    ...COMMON_EMPLOYMENT,
    ...COMMON_METADATA,
  ];

  const tu = common.map(c => ({ ...c, bureau: "TransUnion" }));
  const eq = common.map(c => ({ ...c, bureau: "Equifax" }));

  const all = [...tu, ...eq];

  if (bureau) {
    return all.filter(m => m.bureau === bureau);
  }

  return all;
}