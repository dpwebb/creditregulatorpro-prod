import CryptoJS from "crypto-js";

/**
 * Computes a SHA256 hash chain.
 *
 * @param prev The previous hash in the chain. Defaults to 'GENESIS' if undefined.
 * @param payload The data payload to include in the hash.
 * @returns The resulting hex string of the SHA256 hash.
 */
export interface HashChainEntry {
  previousHash?: string | null;
  currentHash: string;
  payload: unknown;
}

export interface VerificationResult {
  valid: boolean;
  brokenAt?: number;
  expectedHash?: string;
  actualHash?: string;
}

/**
 * Computes a SHA256 hash chain.
 *
 * @param prev The previous hash in the chain. Defaults to 'GENESIS' if undefined.
 * @param payload The data payload to include in the hash.
 * @returns The resulting hex string of the SHA256 hash.
 */
export function chain(prev: string | undefined, payload: unknown): string {
  const previousHash = prev || "GENESIS";
  const payloadString = JSON.stringify(payload);
  const dataToHash = previousHash + payloadString;

  return CryptoJS.SHA256(dataToHash).toString(CryptoJS.enc.Hex);
}

/**
 * Verifies a sequence of hash chain entries.
 *
 * @param entries An array of entries containing the previousHash, currentHash, and payload.
 * @returns An object indicating whether the chain is valid and details about any failure.
 */
export function verifyChain(entries: HashChainEntry[]): VerificationResult {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check link to previous entry for all subsequent entries
    if (i > 0) {
      const prevEntry = entries[i - 1];
      if (entry.previousHash !== prevEntry.currentHash) {
        return {
          valid: false,
          brokenAt: i,
          expectedHash: prevEntry.currentHash,
          actualHash: entry.previousHash ?? undefined,
        };
      }
    }

    // Verify the hash of the current entry
    const prev = entry.previousHash ?? undefined;
    const expectedCurrentHash = chain(prev, entry.payload);
    
    if (entry.currentHash !== expectedCurrentHash) {
      return {
        valid: false,
        brokenAt: i,
        expectedHash: expectedCurrentHash,
        actualHash: entry.currentHash,
      };
    }
  }

  return { valid: true };
}