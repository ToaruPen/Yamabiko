import { describe, expect, it } from "vitest";
import { createDefaultActionabilitySignal } from "../../../src/application/signals/default-actionability-signal.js";
import { classifyActionability } from "../../../src/domain/policy/actionability.js";

describe("createDefaultActionabilitySignal", () => {
  it("returns a signal that classifies as 'suggest'", () => {
    const signal = createDefaultActionabilitySignal();
    const result = classifyActionability(signal);

    expect(result).toBe("suggest");
  });

  it("returns a signal with trustedExecution: false", () => {
    const signal = createDefaultActionabilitySignal();

    expect(signal.trustedExecution).toBe(false);
  });

  it("returns a signal with all positive flags for non-ignore classification", () => {
    const signal = createDefaultActionabilitySignal();

    expect(signal.hasConcreteTarget).toBe(true);
    expect(signal.hasBoundedChange).toBe(true);
    expect(signal.requiresHiddenContext).toBe(false);
    expect(signal.requiresUnsafeSideEffects).toBe(false);
  });
});
