import { db } from "./db";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

/**
 * Removes white/near-white background from a base64 encoded image and returns a base64 encoded PNG.
 * 
 * @param base64ImageData The base64 encoded image data.
 * @returns A promise resolving to the base64 encoded PNG data.
 */
/**
 * Formats a full name to a first-initial + last-name format (e.g., "Jane Smith" -> "J. Smith").
 * 
 * @param fullName The full name string.
 * @returns The formatted signature name.
 */
export function formatSignatureName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Consumer";
  
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  
  const firstInitial = parts[0][0].toUpperCase();
  const lastName = parts[parts.length - 1];
  
  return `${firstInitial}. ${lastName}`;
}

/**
 * Removes white/near-white background from a base64 encoded image and returns a base64 encoded PNG.
 * 
 * @param base64ImageData The base64 encoded image data.
 * @returns A promise resolving to the base64 encoded PNG data.
 */
export async function removeWhiteBackground(base64ImageData: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const buffer = Buffer.from(base64ImageData, "base64");
      let width, height, data;

      // Check magic bytes to determine image format
      // JPEG starts with FF D8
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        const rawImageData = jpeg.decode(buffer, { useTArray: true });
        width = rawImageData.width;
        height = rawImageData.height;
        data = rawImageData.data;
      } else {
        // Assume PNG format
        const png = PNG.sync.read(buffer);
        width = png.width;
        height = png.height;
        data = png.data;
      }

      const outPng = new PNG({ width, height });

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (width * y + x) << 2;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const sum = r + g + b;

          outPng.data[idx] = r;
          outPng.data[idx + 1] = g;
          outPng.data[idx + 2] = b;

          if (sum > 600) {
outPng.data[idx + 3] = 0; // Fully transparent for white/near-white
} else if (sum < 180) {
outPng.data[idx + 3] = 255; // Solid for dark ink
} else {
// Gradient for mid-range (sum from 180 to 600 -> alpha from 255 to 0)
const alpha = Math.round(((600 - sum) / 420) * 255);
outPng.data[idx + 3] = Math.max(0, Math.min(255, alpha));
}
        }
      }

      const outBuffer = PNG.sync.write(outPng);
      resolve(outBuffer.toString("base64"));
    } catch (e) {
      console.error("[Gemini Signature] Failed to remove white background:", e);
      resolve(base64ImageData); // Fallback to original if processing fails
    }
  });
}

/**
 * Generates a realistic handwritten signature image using Google Gemini AI.
 * 
 * @param fullName The full name to generate the signature for.
 * @returns A promise resolving to a base64 data URI of the generated image, or an empty string on failure.
 */
export async function generateSignatureImage(fullName: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GEMINI_SA_KEY;

  if (!apiKey) {
    console.error(
      "[Gemini Signature] GOOGLE_GEMINI_SA_KEY not found in environment variables",
    );
    return "";
  }

  try {
            const prompt = `Generate a photorealistic handwritten signature of the name '${fullName}' as it would appear signed with a real ballpoint pen on white paper. The signature should look like a natural abbreviated signing, using flowing, expressive handwriting script styles. Requirements: black or dark blue ink only on a plain white background. The signature must look authentically hand-signed — use natural pen pressure variation where downstrokes are thicker and upstrokes are thinner. Include slight imperfections like minor wobbles, ink pooling at stroke starts, and tapering at stroke ends. Letterforms should be connected in flowing cursive with some letters partially illegible as in a real fast signature. Add subtle ink flow characteristics — slightly uneven density, occasional micro-breaks where the pen lifts briefly. The overall shape should have a natural slant and baseline drift. No printed text, no borders, no decorative elements — just the raw signature against white.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Gemini Signature] API request failed with status ${response.status}:`,
        errorText,
      );
      return "";
    }

    const data = (await response.json()) as any;

    if (data.error) {
      console.error("[Gemini Signature] API returned error:", data.error.message);
      return "";
    }

    const part = data.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.data && p.inlineData?.mimeType
    ) || data.candidates?.[0]?.content?.parts?.[0];

    const base64data = part?.inlineData?.data;

    if (!base64data) {
      console.warn("[Gemini Signature] No image data found in response");
      return "";
    }

    const processedBase64 = await removeWhiteBackground(base64data);
    return `data:image/png;base64,${processedBase64}`;
  } catch (error) {
    if (error instanceof Error) {
      console.error("[Gemini Signature] Generation failed:", error.message);
    } else {
      console.error("[Gemini Signature] Generation failed:", error);
    }
    return "";
  }
}

/**
 * Ensures a user has a 'document_signing' signature in the consumer_signature table.
 * If one exists, it returns the existing signature data.
 * If not, it fetches the user's name, generates a new AI image signature, saves it, and returns it.
 *
 * @param userId The ID of the user.
 * @returns A promise that resolves to the data URI signature string (or empty string if generation failed).
 */
export async function ensureUserSignature(userId: number): Promise<string> {
  // Check for an existing document_signing signature
  const existingSignature = await db
    .selectFrom("consumerSignature")
    .select("signatureData")
    .where("userId", "=", userId)
    .where("signatureType", "=", "document_signing")
    .executeTakeFirst();

  if (existingSignature && existingSignature.signatureData) {
    return existingSignature.signatureData;
  }

  // Fetch the user's full name from their account profile
  const userAccount = await db
    .selectFrom("userAccount")
    .select("fullName")
    .where("userId", "=", userId)
    .executeTakeFirst();

  const fullName = userAccount?.fullName?.trim() || "Consumer Name";
  const newSignatureData = await generateSignatureImage(formatSignatureName(fullName));

  if (newSignatureData) {
    // Insert the newly generated signature into the database
    await db
      .insertInto("consumerSignature")
      .values({
        userId,
        signatureType: "document_signing",
        signatureData: newSignatureData,
        isVerified: true,
        verifiedAt: new Date(),
      })
      .execute();
  }

  return newSignatureData;
}
