import type { ActionabilitySignal } from "../../domain/policy/actionability.js";

/**
 * Temporary stub - returns optimistic defaults (all actionable).
 * Replace with real signal extraction from review event content
 * once policy evaluation (Phase 4) is implemented.
 */
export function createDefaultActionabilitySignal(): ActionabilitySignal {
  return {
    hasConcreteTarget: true,
    hasBoundedChange: true,
    requiresHiddenContext: false,
    requiresUnsafeSideEffects: false,
    trustedExecution: false,
  };
}
