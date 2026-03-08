ALTER TABLE "review_runs" ADD COLUMN "actor_login" text;--> statement-breakpoint
ALTER TABLE "review_runs" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "review_runs" ADD COLUMN "received_at" timestamp with time zone;
