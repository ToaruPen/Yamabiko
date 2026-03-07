import type { ActionabilitySignal } from "../../domain/policy/actionability.js";

export function createDefaultActionabilitySignal(): ActionabilitySignal {
  return {
    hasConcreteTarget: true,
    hasBoundedChange: true,
    requiresHiddenContext: false,
    requiresUnsafeSideEffects: false,
    trustedExecution: false,
  };
}
