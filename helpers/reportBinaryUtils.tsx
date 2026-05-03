import { createHash } from "crypto";

export function cleanBase64Payload(base64Data: string): string {
  const payload = base64Data.includes(",") ? base64Data.split(",").pop() || "" : base64Data;
  return payload.replace(/\s+/g, "");
}

export function base64PayloadToBuffer(base64Data: string): Buffer {
  return Buffer.from(cleanBase64Payload(base64Data), "base64");
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256HexOfBase64Payload(base64Data: string): string {
  return sha256Hex(base64PayloadToBuffer(base64Data));
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sha256HexOfJson(value: unknown): string {
  return sha256Hex(JSON.stringify(jsonSafe(value)));
}
