import { boolean, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { RUN_MODES } from "../../domain/runs/review-run.js";

const REVIEW_ACTIONABILITIES = ["ignore", "suggest", "apply"] as const;

export const reviewActionabilityEnum = pgEnum(
  "review_actionability",
  REVIEW_ACTIONABILITIES,
);
export const runModeEnum = pgEnum("run_mode", RUN_MODES);

export const reviewRunsTable = pgTable("review_runs", {
  actionability: reviewActionabilityEnum("actionability").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  errorMessage: text("error_message"),
  headSha: text("head_sha").notNull(),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  mode: runModeEnum("mode").notNull(),
  pullRequestNumber: text("pull_request_number").notNull(),
  repositoryName: text("repository_name").notNull(),
  repositoryOwner: text("repository_owner").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
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
