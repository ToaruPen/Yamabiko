CREATE TYPE "public"."review_actionability" AS ENUM('ignore', 'suggest', 'apply');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('dry-run', 'suggest-only', 'push-enabled');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"created_at" timestamp with time zone NOT NULL,
	"key" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_runs" (
	"actionability" "review_actionability" NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"error_message" text,
	"head_sha" text,
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mode" "run_mode" NOT NULL,
	"pull_request_number" integer NOT NULL,
	"repository_name" text NOT NULL,
	"repository_owner" text NOT NULL,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"action" text NOT NULL,
	"event_type" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
