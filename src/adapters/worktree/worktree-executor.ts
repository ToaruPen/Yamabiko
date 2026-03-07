export interface WorktreeCommand {
  args: readonly string[];
  command: string;
}

export interface WorktreeExecutionResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface WorktreeExecutor {
  execute(command: WorktreeCommand): Promise<WorktreeExecutionResult>;
}
