import { SignJWT, importPKCS8 } from "jose";
import { GCS_BUCKET_NAME } from "./_publicConfigs";

// Helper to convert ArrayBuffer to Hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a PEM-formatted private key to an ArrayBuffer suitable for crypto.subtle.importKey
 */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Strip out standard PEM headers/footers and whitespace
  const b64 = pem
    .replace(/-----[A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Signs a string using RSASSA-PKCS1-v1_5 with SHA-256 via the Web Crypto API
async function signRsaSha256(data: string, pemPrivateKey: string): Promise<string> {
  const keyBuffer = pemToArrayBuffer(pemPrivateKey);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available in this environment.");
  }
  
  const key = await subtle.importKey(
    "pkcs8",
    keyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signatureBuffer = await subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data)
  );

  return arrayBufferToHex(signatureBuffer);
}

/**
 * Retrieves a GCS OAuth 2.0 access token using a service account JWT assertion.
 */
async function getGcsAccessToken(credentials: { client_email: string; private_key: string }): Promise<string> {
  const privateKey = await importPKCS8(credentials.private_key, "RS256");
  const jwt = await new SignJWT({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: "https://oauth2.googleapis.com/token",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to get Google access token: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token as string;
}

/**
 * Parses and validates GCS service account credentials from the environment variable.
 */
function getGcsCredentials(): { client_email: string; private_key: string } {
  const serviceAccountKey = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error("GCS_SERVICE_ACCOUNT_KEY is not set in environment variables");
  }
  try {
    return JSON.parse(serviceAccountKey);
  } catch {
    throw new Error("GCS_SERVICE_ACCOUNT_KEY is not a valid JSON");
  }
}

/**
 * Uploads a base64 encoded file to Google Cloud Storage with a configurable content type.
 * Generates an OAuth 2.0 access token via JWT and uploads via the GCS JSON API.
 *
 * @param base64File Base64 string of the file (optionally with data URL prefix)
 * @param objectName Destination object name/path in the bucket
 * @param contentType MIME type of the file (e.g. "application/pdf", "image/png")
 * @returns A DB-safe string referencing the GCS object (e.g. gcs:{objectName})
 */
export async function uploadFile(base64File: string, objectName: string, contentType: string): Promise<string> {
  const credentials = getGcsCredentials();
  const accessToken = await getGcsAccessToken(credentials);

  // Clean base64 string if it contains a data URI prefix
  const base64Data = base64File.includes(",") ? base64File.split(",")[1] : base64File;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Upload file using the GCS JSON API
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": contentType,
      "Content-Length": bytes.length.toString(),
    },
    body: bytes,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`Failed to upload file to GCS: ${errText}`);
  }

  return `gcs:${objectName}`;
}

/**
 * Uploads a base64 encoded PDF to Google Cloud Storage.
 * Convenience wrapper around uploadFile with content type set to "application/pdf".
 *
 * @param base64Pdf Base64 string of the PDF (optionally with data URL prefix)
 * @param objectName Destination object name/path in the bucket
 * @returns A DB-safe string referencing the GCS object (e.g. gcs:{objectName})
 */
export async function uploadPdf(base64Pdf: string, objectName: string): Promise<string> {
  return uploadFile(base64Pdf, objectName, "application/pdf");
}

/**
 * Generates a V4 signed URL for secure, time-limited reading of an object from GCS.
 * 
 * @param objectName Object name in the bucket
 * @param expiresInSeconds Duration the URL is valid (default 1 hour)
 * @returns Complete signed URL
 */
export async function generateSignedUrl(objectName: string, expiresInSeconds: number = 3600): Promise<string> {
  const credentials = getGcsCredentials();
  const clientEmail = credentials.client_email;
  const privateKey = credentials.private_key;

  const method = "GET";
  const host = "storage.googleapis.com";
  
  // The object name might contain slashes. We need to split, encode components, and rejoin.
  const encodedObjectName = objectName.split('/').map(encodeURIComponent).join('/');
  const canonicalUri = `/${GCS_BUCKET_NAME}/${encodedObjectName}`;

  const now = new Date();
  // Format strictly to YYYYMMDDTHHMMSSZ
  const timestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const datestamp = timestamp.substring(0, 8); // YYYYMMDD

  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credentialParam = `${clientEmail}/${credentialScope}`;

  const searchParams = new URLSearchParams();
  searchParams.set("X-Goog-Algorithm", "GOOG4-RSA-SHA256");
  searchParams.set("X-Goog-Credential", credentialParam);
  searchParams.set("X-Goog-Date", timestamp);
  searchParams.set("X-Goog-Expires", expiresInSeconds.toString());
  searchParams.set("X-Goog-SignedHeaders", "host");

  const keys = Array.from(searchParams.keys()).sort();
  const canonicalQueryParts = keys.map((key) => {
    const val = searchParams.get(key) || "";
    return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
  });
  const canonicalQueryString = canonicalQueryParts.join("&");

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  // V4 canonical request format requires exact newline placement, especially 
  // the empty line between canonical headers and signed headers.
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available.");
  }

  const canonicalRequestHashBuffer = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRequest)
  );
  const canonicalRequestHash = arrayBufferToHex(canonicalRequestHashBuffer);

  const stringToSign = [
    "GOOG4-RSA-SHA256",
    timestamp,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signatureHex = await signRsaSha256(stringToSign, privateKey);

  const finalUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
  return finalUrl;
}

/**
 * Resolves a storage URL value to a readable URL.
 * Transparently handles legacy base64 strings vs modern GCS paths.
 * 
 * @param pdfStorageUrl The storage reference value from the database
 * @returns A fully resolved URL, raw base64 data, or null
 */
export async function resolvePdfStorageUrl(pdfStorageUrl: string | null): Promise<string | null> {
  if (!pdfStorageUrl) {
    return null;
  }
  
  if (pdfStorageUrl.startsWith("gcs:")) {
    const objectName = pdfStorageUrl.substring(4);
    return generateSignedUrl(objectName);
  }
  
  return pdfStorageUrl;
}