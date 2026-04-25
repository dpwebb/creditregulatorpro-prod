export type ExtractedAddress = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
};

export type ExtractedConsumerInfo = {
  fullName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  dateOfBirth: Date | null;
  dateOfBirthRaw: string | null;
  phone: string | null;
  phoneSecondary?: string | null;
  sinLastDigits?: string | null;
  previousAddresses: ExtractedAddress[];
  confidence: number; // 0-100
};