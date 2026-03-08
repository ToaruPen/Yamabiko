import type {
  FixExecutionRequest,
  FixExecutionResult,
  FixExecutor,
} from "../application/ports/fix-executor.js";

export class StubFixExecutor implements FixExecutor {
  public execute(request: FixExecutionRequest): Promise<FixExecutionResult> {
    return Promise.resolve({
      changedFiles: [],
      summary: `Stub executor — no real fix applied for run ${request.run.id}.`,
    });
  }
}
