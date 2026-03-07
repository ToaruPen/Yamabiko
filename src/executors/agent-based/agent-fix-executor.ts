import type {
  FixExecutionRequest,
  FixExecutionResult,
  FixExecutor,
} from "../../adapters/llm/fix-executor.js";

export class AgentBasedFixExecutor implements FixExecutor {
  public execute(request: FixExecutionRequest): Promise<FixExecutionResult> {
    return Promise.resolve({
      changedFiles: [],
      summary: `Agent-based executor is ready to evaluate run ${request.run.id}.`,
    });
  }
}
