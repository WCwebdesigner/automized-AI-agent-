/**
 * Verification Module — Phase 4
 */

export * from "./types";
export * from "./engine";
export * from "./plan";
export * from "./decision";

// Legacy verifier backward compat
export { Verifier, globalVerifier } from "./verifier";
export type { VerificationCheck as LegacyVerificationCheck, VerificationResult as LegacyVerificationResult } from "./verifier";
