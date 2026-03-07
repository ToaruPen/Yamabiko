ALTER TABLE "review_runs" ADD COLUMN "actor_login" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "review_runs" ADD COLUMN "body" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "review_runs" ADD COLUMN "received_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "review_runs" ALTER COLUMN "actor_login" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "review_runs" ALTER COLUMN "body" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "review_runs" ALTER COLUMN "received_at" DROP DEFAULT;
