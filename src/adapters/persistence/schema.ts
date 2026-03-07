import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { ACTIONABILITIES } from "../../domain/policy/actionability.js";
import { RUN_MODES, RUN_STATUSES } from "../../domain/runs/review-run.js";

export const reviewActionabilityEnum = pgEnum(
  "review_actionability",
  ACTIONABILITIES,
);
export const runModeEnum = pgEnum("run_mode", RUN_MODES);
export const runStatusEnum = pgEnum("run_status", RUN_STATUSES);

export const reviewRunsTable = pgTable("review_runs", {
  actionability: reviewActionabilityEnum("actionability").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  errorMessage: text("error_message"),
  headSha: text("head_sha"),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  mode: runModeEnum("mode").notNull(),
  pullRequestNumber: integer("pull_request_number").notNull(),
  repositoryName: text("repository_name").notNull(),
  repositoryOwner: text("repository_owner").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  status: runStatusEnum("status").notNull().default("pending"),
});

export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  action: text("action").notNull(),
  eventType: text("event_type").notNull(),
  id: text("id").primaryKey(),
  processed: boolean("processed").notNull().default(false),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
});

export const idempotencyKeysTable = pgTable("idempotency_keys", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  key: text("key").primaryKey(),
  runId: text("run_id").notNull(),
});
