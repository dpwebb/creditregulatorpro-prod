import { enforceRetention } from "./dataRetention";

export async function cronRetention(): Promise<void> {
  console.log("Starting cronRetention job...");
  try {
    // Pass true to confirm deletion
    const summary = await enforceRetention(true);
    console.log("cronRetention completed:", summary);
  } catch (error) {
    console.error("cronRetention failed:", error);
  }
}