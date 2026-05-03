import { ExtractedConsumerInfo, ExtractedAddress } from "./consumerInfoExtractorTypes";
import { extractName } from "./consumerInfoExtractorName";
import { extractCurrentAddress, extractPreviousAddresses } from "./consumerInfoExtractorAddress";
import { extractDateOfBirth } from "./consumerInfoExtractorDob";
import { extractPhone } from "./consumerInfoExtractorPhone";
import { extractTransUnionSection, findTransUnionDateString } from "./transunionTextParsing";

// Re-export types for backward compatibility
export type { ExtractedConsumerInfo, ExtractedAddress } from "./consumerInfoExtractorTypes";

/**
 * Extracts consumer personal information from credit report text.
 * Optimized for Canadian credit reports (Equifax/TransUnion).
 */
export function extractConsumerInfo(text: string): ExtractedConsumerInfo {
  const info: ExtractedConsumerInfo = {
    fullName: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    dateOfBirth: null,
    dateOfBirthRaw: null,
    phone: null,
    previousAddresses: [],
    confidence: 0,
  };

  if (!text) return info;

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Extract name
  const nameResult = extractName(lines);
  info.fullName = nameResult.name;
  info.confidence += nameResult.confidence;

  // Extract current address
  const addressResult = extractCurrentAddress(lines);
  info.addressLine1 = addressResult.address.addressLine1 || null;
  info.addressLine2 = addressResult.address.addressLine2 || null;
  info.city = addressResult.address.city || null;
  info.province = addressResult.address.province || null;
  info.postalCode = addressResult.address.postalCode || null;
  info.confidence += addressResult.confidence;

  // Extract previous addresses
  const previousResult = extractPreviousAddresses(lines);
  info.previousAddresses = previousResult.addresses;
  info.confidence += previousResult.confidence;

  // Extract date of birth
  const dobResult = extractDateOfBirth(text, lines);
  info.dateOfBirth = dobResult.dob;
  info.confidence += dobResult.confidence;

  // Attempt to extract the raw string as well
  const transUnionDobContext = text.match(/Birth\s*Date[\s\S]{0,180}/i);
  const transUnionPersonalInfo = extractTransUnionSection(text, [
    /Personal Information\s*:/i,
    /Personal Info\s*:/i,
  ]);
  const transUnionDobRaw =
    (transUnionDobContext ? findTransUnionDateString(transUnionDobContext[0]) : null) ||
    (transUnionPersonalInfo ? findTransUnionDateString(transUnionPersonalInfo) : null);
  const dobRawMatch = text.match(/(?:DOB|Date\s+of\s+Birth|Birth\s+Date|Date\s+de\s+naissance|D\.O\.B\.|Birth\s+Day|BIRTH\s*DATE)[\s:=]+([A-Za-z0-9,\s\/-]+?)(?:\s*(?:\n|$|\s{2,}))/i);
  const genericDobRaw = dobRawMatch?.[1]?.trim() ?? null;
  const genericDobLooksValid =
    genericDobRaw &&
    (findTransUnionDateString(genericDobRaw) || /\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/.test(genericDobRaw));

  if (transUnionDobRaw) {
    info.dateOfBirthRaw = transUnionDobRaw;
  } else if (genericDobLooksValid) {
    info.dateOfBirthRaw = genericDobRaw;
  }

  // Extract phone number
  const phoneResult = extractPhone(text, lines);
  info.phone = phoneResult.phone;
  info.confidence += phoneResult.confidence;

  // Cap confidence
  info.confidence = Math.min(100, info.confidence);

  console.log("[ConsumerInfoExtractor] Extracted:", info);
  return info;
}
