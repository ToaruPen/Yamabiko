export const ACTIONABILITIES = ["ignore", "suggest", "apply"] as const;
export type ReviewActionability = (typeof ACTIONABILITIES)[number];

export interface ActionabilitySignal {
  hasBoundedChange: boolean;
  hasConcreteTarget: boolean;
  requiresHiddenContext: boolean;
  requiresUnsafeSideEffects: boolean;
  trustedExecution: boolean;
}

export function classifyActionability(
  signal: ActionabilitySignal,
): ReviewActionability {
  if (!signal.hasConcreteTarget) {
    return "ignore";
  }

  if (!signal.hasBoundedChange) {
    return "ignore";
  }

  if (signal.requiresHiddenContext) {
    return "ignore";
  }

  if (signal.requiresUnsafeSideEffects) {
    return "ignore";
  }

  if (!signal.trustedExecution) {
    return "suggest";
  }

  return "apply";
}
