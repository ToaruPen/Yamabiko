import { z } from "zod";

import { RUN_MODES, type RunMode } from "../domain/runs/review-run.js";

const runtimeConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/call_n_response"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  RUN_MODE: z.enum(RUN_MODES).default("dry-run"),
  WEBHOOK_SECRET: z.string().min(1),
});

const workerConfigSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/call_n_response"),
  RUN_MODE: z.enum(RUN_MODES).default("dry-run"),
});

export interface RuntimeConfig {
  databaseUrl: string;
  host: string;
  port: number;
  runMode: RunMode;
  webhookSecret: string;
}

export interface WorkerConfig {
  databaseUrl: string;
  runMode: RunMode;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = runtimeConfigSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.HOST,
    port: parsed.PORT,
    runMode: parsed.RUN_MODE,
    webhookSecret: parsed.WEBHOOK_SECRET,
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = workerConfigSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    runMode: parsed.RUN_MODE,
  };
}
