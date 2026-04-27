import { db } from "./db";
import { compareConsumerInfo, ConsumerInfoComparison } from "./fuzzyMatcher";
import { ExtractedConsumerInfo } from "./consumerInfoExtractorTypes";

export type ProfileUpdateResult = {
  profileFieldsPopulated: string[];
  updatedUserAccount: any;
  consumerInfoComparison: ConsumerInfoComparison | null;
};

/**
 * Updates user profile fields with data extracted from the report if they are currently empty.
 * Also performs comparison between extracted info and profile info.
 */
export async function updateUserProfileFromReport(
  userAccount: any,
  consumerInfo: ExtractedConsumerInfo | undefined | null
): Promise<ProfileUpdateResult> {
  const profileFieldsPopulated: string[] = [];
  let consumerInfoComparison: ConsumerInfoComparison | null = null;
  let updatedUserAccount = { ...userAccount };

  if (consumerInfo && userAccount) {
    const updates: {
      fullName?: string;
      addressLine1?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      dateOfBirth?: Date;
      phone?: string;
    } = {};

    if (!userAccount.fullName && consumerInfo.fullName) {
      updates.fullName = consumerInfo.fullName;
      profileFieldsPopulated.push("fullName");
    }

    if (!userAccount.addressLine1 && consumerInfo.addressLine1) {
      updates.addressLine1 = consumerInfo.addressLine1;
      profileFieldsPopulated.push("addressLine1");
    }

    if (!userAccount.city && consumerInfo.city) {
      updates.city = consumerInfo.city;
      profileFieldsPopulated.push("city");
    }

    if (!userAccount.province && consumerInfo.province) {
      updates.province = consumerInfo.province;
      profileFieldsPopulated.push("province");
    }

    if (!userAccount.postalCode && consumerInfo.postalCode) {
      updates.postalCode = consumerInfo.postalCode;
      profileFieldsPopulated.push("postalCode");
    }

    console.log(`[Ingest] User account profile data - dateOfBirth type: ${typeof userAccount.dateOfBirth}, value: ${JSON.stringify(userAccount.dateOfBirth)}`);
    console.log(`[Ingest] Extracted consumerInfo dateOfBirth type: ${typeof consumerInfo.dateOfBirth}, value: ${JSON.stringify(consumerInfo.dateOfBirth)}`);
    console.log(`[Ingest] Profile dateOfBirth: ${userAccount.dateOfBirth}, Extracted dateOfBirth: ${consumerInfo.dateOfBirth}`);
    
    // Check if userAccount.dateOfBirth is null or undefined (removed !== '' string check for Date type)
    const hasExistingDob = userAccount.dateOfBirth != null;
    const hasExtractedDob = consumerInfo.dateOfBirth != null;
    console.log(`[Ingest] hasExistingDob: ${hasExistingDob}, hasExtractedDob: ${hasExtractedDob}`);
    
    if (!hasExistingDob && hasExtractedDob) {
      updates.dateOfBirth = consumerInfo.dateOfBirth!;
      profileFieldsPopulated.push("dateOfBirth");
    }

    console.log(`[Ingest] Profile phone: ${userAccount.phone}, Extracted phone: ${consumerInfo.phone}`);
    if (!userAccount.phone && consumerInfo.phone) {
      updates.phone = consumerInfo.phone;
      profileFieldsPopulated.push("phone");
    }

    // Apply updates if any fields need to be populated
    if (Object.keys(updates).length > 0) {
      console.log(`[Ingest] Auto-populating user profile fields: ${profileFieldsPopulated.join(", ")}`);
      await db
        .updateTable("userAccount")
        .set(updates)
        .where("id", "=", userAccount.id)
        .execute();
      
      // Update the in-memory userAccount object for comparison
      updatedUserAccount = { ...userAccount, ...updates };
    }
  }
  
  // Compare consumer info with user profile if extracted
  if (consumerInfo && updatedUserAccount) {
        consumerInfoComparison = compareConsumerInfo(
      consumerInfo,
      {
        fullName: updatedUserAccount.fullName,
        addressLine1: updatedUserAccount.addressLine1,
        city: updatedUserAccount.city,
        province: updatedUserAccount.province,
        postalCode: updatedUserAccount.postalCode,
        dateOfBirth: updatedUserAccount.dateOfBirth,
        phone: updatedUserAccount.phone,
      }
    );
    
    console.log(
      `[Ingest] Consumer info comparison: isMatch=${consumerInfoComparison.isMatch}, nameMismatch=${consumerInfoComparison.nameMismatch}, addressMismatch=${consumerInfoComparison.addressMismatch}`
    );
  }

  return {
    updatedUserAccount,
    profileFieldsPopulated,
    consumerInfoComparison
  };
}