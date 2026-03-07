import type { FixExecutor } from "../../application/ports/fix-executor.js";
import { StubFixExecutor } from "../stub-fix-executor.js";

export class AgentBasedFixExecutor
  extends StubFixExecutor
  implements FixExecutor {}
