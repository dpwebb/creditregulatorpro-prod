import { z } from "zod";
import { logger } from "./logger";

export interface PostGridAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceOrState: string;
  postalOrZip: string;
  countryCode: string;
}

export const isPostGridTestMode = () => {
  const apiKey = process.env.POSTGRID_API_KEY || "";
  return apiKey.startsWith("test_");
};

export interface SendLetterParams {
  to: PostGridAddress;
  from: PostGridAddress;
  pdf: string;
  mailingClass: string;
}

function transformAddress(address: PostGridAddress) {
  let { name, addressLine1, addressLine2, ...rest } = address;
  const lowerName = name.toLowerCase();

  const poBoxRegex = /p\.?\s*o\.?\s*box/i;
  if (addressLine2 && poBoxRegex.test(addressLine2) && !poBoxRegex.test(addressLine1)) {
    addressLine2 = undefined;
  }
  
  const companyKeywords = [
    "bureau", "equifax", "transunion", "inc", "ltd", "corp", 
    "agency", "department", "office", "services", "canada", 
    "commission", "llc", "bank", "credit", "financial", "collection",
    "corporation", "association", "ministry", "government", "branch"
  ];
  
  const isCompany = companyKeywords.some(keyword => lowerName.includes(keyword));
  
  let firstName: string | undefined;
  let lastName: string | undefined;
  let companyName: string | undefined;

  if (isCompany) {
    companyName = name;
  } else {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      firstName = parts[0];
    } else {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  return {
    ...rest,
    addressLine1,
    ...(addressLine2 ? { addressLine2 } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(companyName ? { companyName } : {})
  };
}

export const sendRegisteredMail = async (params: SendLetterParams) => {
  const apiKey = process.env.POSTGRID_API_KEY;
  if (!apiKey) throw new Error("POSTGRID_API_KEY is not set");

    const transformedTo = transformAddress(params.to);
  const transformedFrom = transformAddress(params.from);

  logger.info("[PostGrid] Sending letter", {
    to: transformedTo,
    from: transformedFrom,
    mailingClass: params.mailingClass,
  });

  const response = await fetch("https://api.postgrid.com/print-mail/v1/letters", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: transformedTo,
      from: transformedFrom,
      pdf: params.pdf,
      mailingClass: params.mailingClass,
      addressPlacement: "insert_blank_page",
    }),
  });

    const testMode = isPostGridTestMode();
  if (testMode) {
    logger.info("[PostGrid] Running in test mode; no physical mail will be sent");
  }

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = errText;
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.message || parsed.error?.message || errText;
    } catch (e) {}
    throw new Error(`PostGrid API Error: ${errMsg}`);
  }

        const data = await response.json();
  logger.info("[PostGrid] Letter accepted", {
    id: data.id,
    to: data.to,
    from: data.from,
  });
  return { ...data, testMode: isPostGridTestMode() };
};

export const getLetterStatus = async (letterId: string) => {
  const apiKey = process.env.POSTGRID_API_KEY;
  if (!apiKey) throw new Error("POSTGRID_API_KEY is not set");

  const response = await fetch(`https://api.postgrid.com/print-mail/v1/letters/${letterId}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`PostGrid API Error: ${errText}`);
  }

  const data = await response.json();
    return { ...data, testMode: isPostGridTestMode() };
};
