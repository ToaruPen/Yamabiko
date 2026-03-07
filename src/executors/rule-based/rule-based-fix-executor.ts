import type {
  FixExecutionRequest,
  FixExecutionResult,
  FixExecutor,
} from "../../adapters/llm/fix-executor.js";

export class RuleBasedFixExecutor implements FixExecutor {
  public execute(request: FixExecutionRequest): Promise<FixExecutionResult> {
    return Promise.resolve({
      changedFiles: [],
      summary: `Rule-based executor is ready to evaluate run ${request.run.id}.`,
    });
  }
}
